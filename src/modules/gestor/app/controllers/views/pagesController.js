// pagesController.js - migrado para módulo Gestor (views)
import fs from 'fs';
import path from 'path';
import Unidade from '#models/unidade.js';
import Setor from '#models/setor.js';
import Funcionario from '#models/Funcionario.js';
import Funcao from '#models/funcao.js';
import Modulo from '#models/modulo.js';
import User from '#models/user.js';

// Helper consistente para derivar basePath (montagem em /gestor)
function deriveBasePath(req){
  // prioridade: req.baseUrl (Express sub-app), depois res.locals.basePath definido em middleware.
  // fallback final '/gestor' para garantir que assets nunca quebrem se por algum motivo não vier nada.
  const viaBaseUrl = (req && req.baseUrl) ? req.baseUrl.trim() : '';
  const viaLocals = (req && req.res && req.res.locals && req.res.locals.basePath) ? req.res.locals.basePath : (req && req.app && req.app.locals && req.app.locals.basePath);
  const candidate = viaBaseUrl || viaLocals || '';
  if (!candidate || candidate === '/') return '/gestor';
  return candidate;
}
function getEffectiveSkipDb(req) {
  try {
    const appRef = req?.app;
    const parent = appRef?.parent;
    if (parent && Object.prototype.hasOwnProperty.call(parent.locals || {}, 'skipDb')) {
      return !!parent.locals.skipDb;
    }
    if (appRef && Object.prototype.hasOwnProperty.call(appRef.locals || {}, 'skipDb')) {
      return !!appRef.locals.skipDb;
    }
  } catch { /* noop */ }
  return !!req?.app?.locals?.skipDb;
}
function isDbOff(req) {
  return !!getEffectiveSkipDb(req);
}
function stubCtx(req, extra = {}) {
  return {
    user: req.user ?? null,
    dbOffline: true,
    unidades: [],
    modulos: [],
    funcoes: [],
    funcionarios: [],
    recursos: [],
    setores: [],
    usuarios: [],
    estados,
    ...extra,
  };
}

export const estados = [
  { sigla: 'AC', nome: 'Acre' }, { sigla: 'AL', nome: 'Alagoas' }, { sigla: 'AP', nome: 'Amapá' },
  { sigla: 'AM', nome: 'Amazonas' }, { sigla: 'BA', nome: 'Bahia' }, { sigla: 'CE', nome: 'Ceará' },
  { sigla: 'DF', nome: 'Distrito Federal' }, { sigla: 'ES', nome: 'Espírito Santo' }, { sigla: 'GO', nome: 'Goiás' },
  { sigla: 'MA', nome: 'Maranhão' }, { sigla: 'MT', nome: 'Mato Grosso' }, { sigla: 'MS', nome: 'Mato Grosso do Sul' },
  { sigla: 'MG', nome: 'Minas Gerais' }, { sigla: 'PA', nome: 'Pará' }, { sigla: 'PB', nome: 'Paraíba' },
  { sigla: 'PR', nome: 'Paraná' }, { sigla: 'PE', nome: 'Pernambuco' }, { sigla: 'PI', nome: 'Piauí' },
  { sigla: 'RJ', nome: 'Rio de Janeiro' }, { sigla: 'RN', nome: 'Rio Grande do Norte' }, { sigla: 'RS', nome: 'Rio Grande do Sul' },
  { sigla: 'RO', nome: 'Rondônia' }, { sigla: 'RR', nome: 'Roraima' }, { sigla: 'SC', nome: 'Santa Catarina' },
  { sigla: 'SP', nome: 'São Paulo' }, { sigla: 'SE', nome: 'Sergipe' }, { sigla: 'TO', nome: 'Tocantins' }
];

// Helper robusto de privilégio master/admin
function isMasterLike(user){
  if(!user) return false;
  return user.isMaster === true || user.role === 'master';
}

async function carregarUsuariosDiretor(req) {
  if (!(req.user?.isMaster || req.user?.role === 'admin')) return [];
  let usuariosDiretor = await User.find({ ativo: true, role: 'diretor' })
    .populate('funcionario_id', 'nome email')
    .lean();
  const faltando = usuariosDiretor.filter(u => !((u.nome && u.nome.trim()) || (u.funcionario_id && u.funcionario_id.nome)) && u.email);
  if (faltando.length) {
    const emails = [...new Set(faltando.map(f => f.email.toLowerCase()))];
    try {
      const funcs = await Funcionario.find({ email: { $in: emails } }).select('email nome').lean();
      const mapa = {}; funcs.forEach(f => { if (f.email) mapa[f.email.toLowerCase()] = f.nome; });
      usuariosDiretor = usuariosDiretor.map(u => { if (!u.nome && u.email) { const via = mapa[u.email.toLowerCase()]; if (via) u.nome = via; } return u; });
    } catch (e) { console.warn('[pagesController] Falha fallback nome diretor:', e.message); }
  }
  return usuariosDiretor;
}

export async function paginaDashboard(req, res) { return res.render('dashboard-gestor', { user: req.user }); }

export async function paginaFeedback(req, res) {
  try {
    if (!req.user || !(req.user.isMaster || req.user.role === 'admin' || req.user.role === 'master')) {
      return res.status(403).send('Acesso negado');
    }
    // Não carregamos dados server-side: a página consome via fetch os endpoints /api/gestor/feedback*.
    const basePath = deriveBasePath(req);
    if (isDbOff(req)) {
      return res.status(200).render('feedback', stubCtx(req, { basePath }));
    }
    return res.render('feedback', { user: req.user, basePath });
  } catch (e) {
    console.error('[pagesController] /feedback erro:', e && (e.stack || e.message || e));
    return res.status(500).render('erro', { errorMessage: 'Erro ao carregar feedback' });
  }
}
export function paginaLogin(req, res) {
  const { erro } = req.query || {};
  const basePath = deriveBasePath(req);
  try { res.set('X-Public-Page', 'login'); } catch {}
  // Renderiza a view original do login do Gestor (não requer DB)
  return res.render('gestor/logingestor', { basePath, erro });
}
export function paginaContato(req, res) { const basePath = deriveBasePath(req); return res.render('contato', { basePath }); }
export function paginaPrimeiroAcesso(req, res) {
  const { erro } = req.query || {};
  let mensagem = null;
  switch (erro) {
    case 'campos': mensagem = 'Preencha todos os campos.'; break;
    case 'confirmacao': mensagem = 'Confirmação de senha não confere.'; break;
    case 'tamanho': mensagem = 'A nova senha deve ter pelo menos 8 caracteres.'; break;
    case 'forca': mensagem = 'A senha precisa conter maiúscula, minúscula e número.'; break;
    case 'servidor': mensagem = 'Falha ao atualizar senha. Tente novamente.'; break;
    default: mensagem = null;
  }
  const basePath = deriveBasePath(req);
  try { res.set('X-Public-Page', 'primeiroacesso'); } catch {}
  return res.render('primeiroacesso', { mensagem, basePath });
}
export function paginaEsqueciSenha(req, res) { const basePath = deriveBasePath(req); return res.render('esquecisenha', { basePath }); }
export function paginaErro(req, res) { const message = req.query.message || 'Ocorreu um erro desconhecido.'; return res.render('erro', { errorMessage: decodeURIComponent(message) }); }

export async function paginaUsuarios(req, res, next) {
  try {
    if (isDbOff(req)) {
      return res.status(200).render('usuarios', stubCtx(req));
    }
    if (!req.user.isMaster && req.user.role !== 'admin') return res.status(403).send('Acesso negado');
    const query = req.user.isMaster ? {} : { role: { $ne: 'master' } };
    const usuarios = await User.find(query).lean();
    const unidadesFiltradas = await Unidade.find().select('_id codigo nome').lean();
    const funcionarios = await Funcionario.find().select('_id nome cpf').lean();
    return res.render('usuarios', { usuarios, user: req.user, unidadesFiltradas, funcionarios });
  } catch (e) { console.error('[pagesController] /usuarios erro:', e); next(e); }
}

export async function paginaUnidades(req, res) {
  try {
    const isMaster = isMasterLike(req.user);
    console.log('[paginaUnidades] Iniciando carregamento, user:', req.user ? { email: req.user.email, role: req.user.role, isMaster } : 'null');
    if (isDbOff(req)) {
      return res.status(200).render('unidades', stubCtx(req, { unidadesFiltradas: [], principalUnits: [], isMaster: !!req.user?.isMaster, modulos: [], usuariosDiretor: [] }));
    }
    let unidadesFiltradas;
    if (isMaster) {
      console.log('[DEBUG SERVER] Carregando todas unidades para master');
      unidadesFiltradas = await Unidade.find();
      console.log('[DEBUG SERVER] Unidades encontradas:', unidadesFiltradas.length);
    } else {
      const matrizRef = req.user.unidade_principal_id || req.user.unidade_id;
      unidadesFiltradas = matrizRef ? await Unidade.find({ $or: [{ _id: matrizRef }, { unidade_principal_id: matrizRef }] }) : [];
      if ((!unidadesFiltradas || unidadesFiltradas.length === 0) && req.user.unidade_id) {
        unidadesFiltradas = await Unidade.find({ _id: req.user.unidade_id });
      }
      console.log('[paginaUnidades] Unidades filtradas para user:', unidadesFiltradas.length);
      // Fallback: se ainda vazio mas usuário possui permissão elevada (admin), tenta recuperar todas
      if ((!unidadesFiltradas || unidadesFiltradas.length === 0) && (req.user.role === 'admin')) {
        try {
          const todas = await Unidade.find();
          if (todas && todas.length) {
            console.warn('[paginaUnidades] Fallback admin => carregando todas as unidades');
            unidadesFiltradas = todas;
          }
        } catch(_e){}
      }
    }
    try {
      unidadesFiltradas = unidadesFiltradas.map(u => ({ ...u.toObject(), naturezaJuridica: u.naturezaJuridica || '', modulosAcessiveis: Array.isArray(u.modulosAcessiveis) ? u.modulosAcessiveis : [] }));
    } catch (mapErr) {
      console.error('[DEBUG paginaUnidades] Erro no map:', mapErr);
      unidadesFiltradas = [];
    }
    let principalUnits = unidadesFiltradas.filter(u => u.is_principal);
    if (principalUnits.length === 0 && req.user.unidade_principal_id) { const principalDoc = await Unidade.findById(req.user.unidade_principal_id).lean(); if (principalDoc) principalUnits = [principalDoc]; }
    if (principalUnits.length === 0 && req.user.unidade_id) { const doc = await Unidade.findById(req.user.unidade_id).lean(); if (doc) principalUnits = [doc]; }
    const modulos = (isMaster || req.user.role === 'admin') ? await Modulo.find().lean() : await Modulo.find({ status: 'ativo' }).lean();
    if ((!unidadesFiltradas || unidadesFiltradas.length === 0) && isMaster) {
      console.warn('[paginaUnidades] ALERTA: master sem unidades visíveis — verificando fallback matrizes');
      try {
        const matrizes = await Unidade.find({ is_principal: true }).lean();
        if (matrizes?.length) unidadesFiltradas = matrizes;
      } catch(_e){}
    }
    const usuariosDiretor = await carregarUsuariosDiretor(req);
    console.log('[paginaUnidades] Renderizando com unidadesFiltradas:', unidadesFiltradas.length, 'principalUnits:', principalUnits.length);
    return res.render('unidades', { unidadesFiltradas, principalUnits, isMaster, user: req.user, estados, modulos, usuariosDiretor });
  } catch (e) {
    console.error('[pagesController] /unidades erro:', e && (e.stack || e.message || e));
    // Fallback: renderizar página vazia para evitar 500 e permitir diagnóstico de front
    try {
      const safeMaster = isMasterLike(req.user);
      return res.status(200).render('unidades', { unidadesFiltradas: [], principalUnits: [], isMaster: safeMaster, user: req.user || null, estados, modulos: [], usuariosDiretor: [] });
    } catch (e2) {
      console.error('[pagesController] /unidades fallback render falhou:', e2 && (e2.stack || e2.message || e2));
      return res.status(500).send('Erro ao carregar unidades');
    }
  }
}

export async function paginaEditarUnidade(req, res) {
  try {
    const unidadeId = req.params.id;
    const unidade = await Unidade.findById(unidadeId);
    if (!unidade) return res.status(404).send('Unidade não encontrada.');
    let unidadesFiltradas;
    if (req.user.isMaster) { unidadesFiltradas = await Unidade.find(); }
    else {
      const matrizRef = req.user.unidade_principal_id || req.user.unidade_id;
      unidadesFiltradas = matrizRef ? await Unidade.find({ $or: [{ _id: matrizRef }, { unidade_principal_id: matrizRef }] }) : [];
      const permitidoIds = new Set(unidadesFiltradas.map(u => String(u._id)));
      if (!permitidoIds.has(String(unidade._id))) return res.status(403).send('Acesso à unidade não autorizado');
    }
    return res.render('editar-unidades', { unidade, unidadesFiltradas, user: req.user, estados });
  } catch (e) { console.error('[pagesController] /editar-unidades erro:', e.message); return res.status(500).render('erro', { errorMessage: 'Erro ao carregar unidade: ' + e.message }); }
}

export async function paginaModulos(req, res) {
  if (isDbOff(req)) {
    return res.status(200).render('slots-modulos', stubCtx(req, { modulos: [] }));
  }
  if (!req.user.isMaster && req.user.role !== 'admin') return res.status(403).send('Acesso negado');
  const modulos = await Modulo.find();
  return res.render('slots-modulos', { modulos, user: req.user });
}

export async function paginaFuncoes(req, res) {
  try {
    const isMaster = isMasterLike(req.user);
    if (isDbOff(req)) {
      return res.status(200).render('funcoes', stubCtx(req, { funcoesFiltradas: [], modulosFiltrados: [], unidadesPrincipaisFiltradas: [] }));
    }
    let funcoesFiltradas;
    if (isMaster || req.user.role === 'admin') {
      funcoesFiltradas = await Funcao.find().populate('unidade_principal_id modulos_habilitados');
    } else {
      funcoesFiltradas = await Funcao.find({ unidade_principal_id: req.user.unidade_principal_id }).populate('unidade_principal_id modulos_habilitados');
    }
    if ((!funcoesFiltradas || funcoesFiltradas.length === 0) && (isMaster || req.user.role === 'admin')) {
      // fallback: tentar ao menos por matrizes
      const matrizes = await Unidade.find({ is_principal: true }).select('_id').lean();
      const ids = matrizes.map(m => m._id);
      funcoesFiltradas = await Funcao.find({ unidade_principal_id: { $in: ids } }).populate('unidade_principal_id modulos_habilitados');
    }
    const modulosFiltrados = await Modulo.find();
    const unidadesPrincipaisFiltradas = isMaster || req.user.role === 'admin' ? await Unidade.find({ is_principal: true }) : await Unidade.find({ _id: req.user.unidade_principal_id });
    return res.render('funcoes', { funcoesFiltradas, modulosFiltrados, unidadesPrincipaisFiltradas, user: req.user });
  } catch (e) {
    console.error('[pagesController] /funcoes erro:', e.message);
    return res.status(500).send('Erro ao carregar funções');
  }
}

export async function paginaFuncionarios(req, res) {
  try {
    console.log('[paginaFuncionarios] Iniciando carregamento, user:', req.user ? { email: req.user.email, role: req.user.role, isMaster: req.user.isMaster } : 'null');
    if (isDbOff(req)) {
      return res.status(200).render('funcionarios/funcionarios_index', stubCtx(req, { unidadesFiltradas: [], funcoesFiltradas: [], setoresFiltrados: [], funcionarios: [] }));
    }
    const filtro = {};
    if (!req.user?.isMaster && req.user?.unidade_id) filtro.unidade_id = req.user.unidade_id;

    // Calcular escopo de unidades (matriz + filiais) para o usuário
    let unidadesCond = { ativa: true };
    if (!(req.user?.isMaster || req.user?.role === 'admin')) {
      let principalId = req.user?.unidade_principal_id;
      if (!principalId && req.user?.unidade_id) {
        const u = await Unidade.findById(req.user.unidade_id).select('_id is_principal unidade_principal_id matriz_id').lean();
        if (u) principalId = u.is_principal ? u._id : (u.unidade_principal_id || u.matriz_id || u._id);
      }
      unidadesCond = principalId ? { $or: [ { _id: principalId }, { unidade_principal_id: principalId }, { matriz_id: principalId } ] } : { _id: req.user?.unidade_id || null };
    }

    // Filtro de setores conforme escopo calculado
    let setoresCond = { ativo: true };
    if (!(req.user?.isMaster || req.user?.role === 'admin')) {
      const unidadesAcessiveis = await Unidade.find(unidadesCond).select('_id').lean();
      const ids = unidadesAcessiveis.map(u => u._id);
      setoresCond.unidade_id = { $in: ids };
    }

    const [unidadesFiltradas, funcoesFiltradas, setoresFiltrados, funcionarios] = await Promise.all([
      Unidade.find(unidadesCond).select('codigo nome').sort({ nome: 1 }).lean(),
      Funcao.find({ ativa: true }).select('nome').sort({ nome: 1 }).lean(),
      Setor.find(setoresCond).select('nome').sort({ nome: 1 }).lean(),
      Funcionario.find(filtro).select('nome cpf unidade_id funcao_id ativo')
        .populate({ path: 'unidade_id', select: 'nome' })
        .populate({ path: 'funcao_id', select: 'nome' })
        .sort({ nome: 1 }).lean(),
    ]);
    return res.render('funcionarios/funcionarios_index', { user: req.user, unidadesFiltradas, funcoesFiltradas, setoresFiltrados, funcionarios });
  } catch (e) {
    console.error('[pagesController] /funcionarios erro:', e && (e.stack || e.message || e));
    // Fallback: renderizar página vazia para evitar 500 e permitir diagnóstico no front
    try {
      return res.status(200).render('funcionarios/funcionarios_index', stubCtx(req, { unidadesFiltradas: [], funcoesFiltradas: [], setoresFiltrados: [], funcionarios: [] }));
    } catch (e2) {
      console.error('[pagesController] /funcionarios fallback render falhou:', e2 && (e2.stack || e2.message || e2));
      return res.status(500).send('Erro ao carregar funcionários');
    }
  }
}

export async function paginaRecursos(req, res) {
  try {
    const isMaster = isMasterLike(req.user);
    if (isDbOff(req)) {
      return res.status(200).render('recursos', stubCtx(req, { unidadesFiltradas: [] }));
    }
    let unidadesFiltradas = [];
    if (isMaster || req.user.role === 'admin') unidadesFiltradas = await Unidade.find().lean();
    else {
      let principalId = req.user.unidade_principal_id;
      if (!principalId && req.user.unidade_id) {
        const u = await Unidade.findById(req.user.unidade_id).lean();
        if (u) principalId = u.is_principal ? u._id : u.unidade_principal_id;
      }
      const cond = principalId ? { $or: [{ _id: principalId }, { unidade_principal_id: principalId }] } : {};
      unidadesFiltradas = await Unidade.find(cond).lean();
    }
    if ((!unidadesFiltradas || unidadesFiltradas.length === 0) && (isMaster || req.user.role === 'admin')) {
      const matrizes = await Unidade.find({ is_principal: true }).lean();
      if (matrizes?.length) unidadesFiltradas = matrizes;
    }
    return res.render('recursos', { unidadesFiltradas, user: req.user || { nome: 'Usuário Desconhecido', id: null } });
  } catch (e) { console.error('[pagesController] /recursos erro:', e); return res.status(500).render('erro', { errorMessage: 'Erro ao carregar recursos: ' + e.message }); }
}

export async function partialEndereco(req, res) {
  try {
    const basePath = deriveBasePath(req);
    console.info('[partialEndereco] entrada', { url: req.originalUrl, basePath, query: req.query, path: req.path });
    let estadosJson = [];
    try {
      const estadosPath = path.resolve(process.cwd(), 'public', 'data', 'estados.json');
      if (fs.existsSync(estadosPath)) {
        estadosJson = JSON.parse(fs.readFileSync(estadosPath, 'utf8'));
      } else {
        // fallback: usar array exportado acima (estados) se arquivo não existir
        estadosJson = estados;
        console.warn('[partialEndereco] estados.json ausente – usando lista embutida');
      }
    } catch (e) {
      estadosJson = estados; // fallback seguro
      console.warn('[partialEndereco] falha ao ler estados.json, usando lista embutida:', e.message);
    }

    const enderecoValor = req.query.endereco || '';
    const viewCandidates = [
      // Com app.set('views', [views/gestor, views]), o caminho relativo correto é 'partials/endereco'
      'partials/endereco',        // preferencial (resolve para views/gestor/partials/endereco)
      'gestor/partials/endereco', // fallback (resolve em base 'views')
    ];

    function renderTry(idx = 0) {
      if (idx >= viewCandidates.length) {
        console.error('[partialEndereco] nenhuma view encontrada', viewCandidates);
        return res.status(500).render('erro', { errorMessage: 'Nenhum template de endereço encontrado.' });
      }
      const view = viewCandidates[idx];
      res.render(view, { estados: estadosJson, endereco: enderecoValor, basePath }, (err, html) => {
        if (err) {
          console.warn('[partialEndereco] falhou render', { view, erro: err.message });
          return renderTry(idx + 1);
        }
        console.info('[partialEndereco] sucesso', { viewUsada: view, tamanho: html?.length || 0 });
        res.send(html);
      });
    }
    return renderTry(0);
  } catch (e) { console.error('[pagesController] /endereco erro:', e.message); return res.status(500).render('erro', { errorMessage: 'Erro ao carregar endereço: ' + e.message }); }
}

export async function paginaSetores(req, res) {
  try {
    const isMaster = isMasterLike(req.user);
    if (isDbOff(req)) {
      return res.status(200).render('setor', stubCtx(req, { setoresFiltrados: [], unidadesFiltradas: [] }));
    }
    // Determinar unidades acessíveis ao usuário (matriz + filiais)
    let unidadesFiltradas = [];
    let filtroSetores = { ativo: true };
    if (isMaster || req.user?.role === 'admin') {
      // Admin/Master: veem todas as unidades e setores
      unidadesFiltradas = await Unidade.find().select('_id id codigo nome is_principal unidade_principal_id').lean();
    } else {
      // Usuário comum/diretor: limitar matriz e suas unidades-filhas
      let principalId = req.user?.unidade_principal_id;
      if (!principalId && req.user?.unidade_id) {
        const u = await Unidade.findById(req.user.unidade_id).select('_id is_principal unidade_principal_id matriz_id').lean();
        if (u) principalId = u.is_principal ? (u._id) : (u.unidade_principal_id || u.matriz_id || u._id);
      }
      const cond = principalId ? { $or: [ { _id: principalId }, { unidade_principal_id: principalId }, { matriz_id: principalId } ] } : { _id: req.user?.unidade_id || null };
      unidadesFiltradas = await Unidade.find(cond).select('_id id codigo nome is_principal unidade_principal_id').lean();
      const allowedIds = unidadesFiltradas.map(u => String(u._id));
      filtroSetores.unidade_id = { $in: allowedIds };
    }

    // Carregar setores, já filtrados pelas unidades acessíveis
    let setoresFiltrados = await Setor
      .find(filtroSetores)
      .select('nome descricao unidade_id')
      .populate({ path: 'unidade_id', select: 'nome codigo' })
      .sort({ nome: 1 })
      .lean();
    if ((!setoresFiltrados || setoresFiltrados.length === 0) && (isMaster || req.user?.role === 'admin')) {
      // fallback: tenta todos setores
      setoresFiltrados = await Setor.find({})
        .select('nome descricao unidade_id')
        .populate({ path: 'unidade_id', select: 'nome codigo' })
        .sort({ nome: 1 })
        .lean();
      if ((!unidadesFiltradas || unidadesFiltradas.length === 0) && setoresFiltrados?.length) {
        const uids = [...new Set(setoresFiltrados.map(s => String(s.unidade_id?._id || s.unidade_id)).filter(Boolean))];
        unidadesFiltradas = await Unidade.find({ _id: { $in: uids } }).select('_id id codigo nome is_principal unidade_principal_id').lean();
      }
    }

    return res.render('setor', { setoresFiltrados, unidadesFiltradas, user: req.user });
  } catch (e) {
    console.error('[pagesController] /setores erro:', e.message);
    return res.status(500).send('Erro ao carregar setores');
  }
}
