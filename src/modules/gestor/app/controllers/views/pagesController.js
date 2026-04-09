// pagesController.js - migrado para módulo Gestor (views)
import fs from 'fs';
import path from 'path';
import {
  buildUsuariosViewRenderPayload,
  listUsuariosOwnerService,
} from '#modules/gestor/app/services/usuarios/listUsuariosOwner.service.js';
import { loadPaginaFuncoesOwnerBundle } from '#modules/gestor/app/services/funcoes/listPaginaFuncoesOwner.service.js';
import { loadPaginaUnidadesDiretores } from '#modules/gestor/app/services/unidades/loadPaginaUnidadesDiretores.service.js';
import {
  findAllUnidades,
  findUnidadesByMatrizOuPrincipal,
  findUnidadesById,
  findUnidadeByIdLean,
  findAllModulosLean,
  findModulosAtivosStatusLean,
  findUnidadesPrincipaisLean,
  findUnidadeById,
  findAllModulos,
  findAllFuncoesPopuladas,
  findFuncoesByUnidadePrincipalPopuladas,
  findUnidadesPrincipaisSelectIdLean,
  findFuncoesByUnidadePrincipalIdsPopuladas,
  findUnidadesPrincipais,
  findUnidadeUserBaseLean,
  findUnidadesByCondSelectCodigoNomeOrdenadasLean,
  findFuncoesAtivasNomeOrdenadasSelectLean,
  findSetoresByCondNomeOrdenadosSelectLean,
  findSetoresByUnidadeIdPopulateLean,
  findFuncionariosParaListagemComRefsSelectLean,
  findAllUnidadesLean,
  findUnidadesByCondLeanFull,
  findUnidadesForSetorPageSelectLean,
  findUnidadesForSetorPageByCondSelectLean,
  findSetoresByCondDescricaoPopulateUnidadeOrdenadosLean,
  findUnidadesForSetorPageByIdsSelectLean,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

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

function normalizeId(value) {
  return String(value || '').trim();
}

function isPrivilegedGestorUser(user) {
  return isMasterLike(user) || user?.role === 'admin';
}

function getScopedUnitId(req) {
  return normalizeId(req?.unitScope?.unidadeId);
}

async function loadScopedUnidadeForPage(req) {
  const unidadeId = getScopedUnitId(req);
  if (!unidadeId) return null;
  return findUnidadeByIdLean(unidadeId);
}

async function loadScopedUnitContextForPage(req) {
  const scopedUnitId = getScopedUnitId(req);
  if (!scopedUnitId) {
    return {
      scopedUnitId: '',
      scopedUnit: null,
      principalUnitId: '',
      principalUnit: null,
    };
  }

  const [scopedUnit, scopedUnitBase] = await Promise.all([
    findUnidadeByIdLean(scopedUnitId),
    findUnidadeUserBaseLean(scopedUnitId),
  ]);

  const principalUnitId = normalizeId(
    scopedUnitBase?.is_principal
      ? scopedUnitBase?._id
      : scopedUnitBase?.unidade_principal_id || scopedUnitBase?.matriz_id || scopedUnitId,
  );

  const principalUnit = !principalUnitId
    ? null
    : principalUnitId === scopedUnitId
      ? scopedUnit
      : await findUnidadeByIdLean(principalUnitId);

  return {
    scopedUnitId,
    scopedUnit,
    principalUnitId,
    principalUnit,
  };
}

async function loadScopedOperationalUnitContextForFuncionariosPage(req) {
  const scopedContext = await loadScopedUnitContextForPage(req);
  const requestUserUnitId = normalizeId(req?.user?.unidade_id || req?.session?.user?.unidade_id);

  if (!scopedContext.scopedUnitId) {
    return {
      ...scopedContext,
      operationalUnitId: '',
      operationalUnit: null,
    };
  }

  if (!requestUserUnitId || requestUserUnitId === scopedContext.scopedUnitId) {
    return {
      ...scopedContext,
      operationalUnitId: scopedContext.scopedUnitId,
      operationalUnit: scopedContext.scopedUnit,
    };
  }

  const requestUserUnitBase = await findUnidadeUserBaseLean(requestUserUnitId);
  const requestUserPrincipalUnitId = normalizeId(
    requestUserUnitBase?.is_principal
      ? requestUserUnitBase?._id
      : requestUserUnitBase?.unidade_principal_id || requestUserUnitBase?.matriz_id || requestUserUnitId,
  );

  if (!requestUserPrincipalUnitId || requestUserPrincipalUnitId !== scopedContext.principalUnitId) {
    return {
      ...scopedContext,
      operationalUnitId: scopedContext.scopedUnitId,
      operationalUnit: scopedContext.scopedUnit,
    };
  }

  return {
    ...scopedContext,
    operationalUnitId: requestUserUnitId,
    operationalUnit: await findUnidadeByIdLean(requestUserUnitId),
  };
}

async function loadScopedUnidadesClusterForPage(req) {
  const scopedContext = await loadScopedUnitContextForPage(req);
  if (!scopedContext.scopedUnitId) {
    return {
      ...scopedContext,
      unidadesFiltradas: [],
    };
  }

  let unidadesFiltradas = scopedContext.principalUnitId
    ? await findUnidadesByMatrizOuPrincipal(scopedContext.principalUnitId)
    : [];

  if ((!unidadesFiltradas || unidadesFiltradas.length === 0) && scopedContext.scopedUnit) {
    unidadesFiltradas = [scopedContext.scopedUnit];
  }

  return {
    ...scopedContext,
    unidadesFiltradas,
  };
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
    const result = await listUsuariosOwnerService({ isMaster: req.user.isMaster });
    return res.render('usuarios', buildUsuariosViewRenderPayload({ user: req.user, result }));
  } catch (e) { console.error('[pagesController] /usuarios erro:', e); next(e); }
}

export async function paginaUnidades(req, res) {
  try {
    const isMaster = isMasterLike(req.user);
    const privilegedUser = isPrivilegedGestorUser(req.user);
    console.log('[paginaUnidades] Iniciando carregamento, user:', req.user ? { email: req.user.email, role: req.user.role, isMaster } : 'null');
    if (isDbOff(req)) {
      return res.status(200).render('unidades', stubCtx(req, { unidadesFiltradas: [], principalUnits: [], isMaster: !!req.user?.isMaster, modulos: [], usuariosDiretor: [] }));
    }
    const scopedContext = await loadScopedUnidadesClusterForPage(req);
    let unidadesFiltradas;
    if (scopedContext.scopedUnitId) {
      unidadesFiltradas = scopedContext.unidadesFiltradas;
      console.log('[paginaUnidades] Unidades filtradas via unitScope:', unidadesFiltradas.length);
    } else if (privilegedUser) {
      console.log('[DEBUG SERVER] Carregando todas unidades para usuário privilegiado');
      unidadesFiltradas = await findAllUnidades();
      console.log('[DEBUG SERVER] Unidades encontradas:', unidadesFiltradas.length);
    } else {
      unidadesFiltradas = [];
      console.log('[paginaUnidades] Unidades filtradas sem unitScope canônico:', unidadesFiltradas.length);
    }
    try {
      unidadesFiltradas = unidadesFiltradas.map((u) => {
        const plain = u?.toObject ? u.toObject() : { ...u };
        return {
          ...plain,
          naturezaJuridica: plain.naturezaJuridica || '',
          modulosAcessiveis: Array.isArray(plain.modulosAcessiveis) ? plain.modulosAcessiveis : [],
        };
      });
    } catch (mapErr) {
      console.error('[DEBUG paginaUnidades] Erro no map:', mapErr);
      unidadesFiltradas = [];
    }
    let principalUnits = unidadesFiltradas.filter(u => u.is_principal);
    if (principalUnits.length === 0 && scopedContext.principalUnit) principalUnits = [scopedContext.principalUnit];
    if (principalUnits.length === 0 && scopedContext.scopedUnit) principalUnits = [scopedContext.scopedUnit];
    const modulos = (isMaster || req.user.role === 'admin') ? await findAllModulosLean() : await findModulosAtivosStatusLean();
    if ((!unidadesFiltradas || unidadesFiltradas.length === 0) && isMaster) {
      console.warn('[paginaUnidades] ALERTA: master sem unidades visíveis — verificando fallback matrizes');
      try {
        const matrizes = await findUnidadesPrincipaisLean();
        if (matrizes?.length) unidadesFiltradas = matrizes;
      } catch(_e){}
    }
    const usuariosDiretor = await loadPaginaUnidadesDiretores({ user: req.user });
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
    const unidade = await findUnidadeById(unidadeId);
    if (!unidade) return res.status(404).send('Unidade não encontrada.');
    const privilegedUser = isPrivilegedGestorUser(req.user);
    let unidadesFiltradas;
    const scopedContext = await loadScopedUnidadesClusterForPage(req);
    if (scopedContext.scopedUnitId) {
      unidadesFiltradas = scopedContext.unidadesFiltradas;
      const permitidoIds = new Set(unidadesFiltradas.map(u => String(u._id)));
      if (!permitidoIds.has(String(unidade._id))) return res.status(403).send('Acesso à unidade não autorizado');
    } else if (privilegedUser) { unidadesFiltradas = await findAllUnidades(); }
    else {
      unidadesFiltradas = [];
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
  const modulos = await findAllModulos();
  return res.render('slots-modulos', { modulos, user: req.user });
}

export async function paginaFuncoes(req, res) {
  try {
    const privilegedUser = isPrivilegedGestorUser(req.user);
    const result = await loadPaginaFuncoesOwnerBundle({
      req,
      privilegedUser,
      isDbOff: isDbOff(req),
      buildStubCtx: stubCtx,
      loadScopedUnitContext: loadScopedUnitContextForPage,
    });
    return res.status(result.statusCode).render('funcoes', result.locals);
  } catch (e) {
    console.error('[pagesController] /funcoes erro:', e.message);
    return res.status(500).send('Erro ao carregar funções');
  }
}

export async function paginaFuncionarios(req, res) {
  try {
    console.log('[paginaFuncionarios] Iniciando carregamento, user:', req.user ? { email: req.user.email, role: req.user.role, isMaster: req.user.isMaster } : 'null');
    if (isDbOff(req)) {
      return res.status(200).render('funcionarios/funcionarios_index', stubCtx(req, { unidadesFiltradas: [], funcoesFiltradas: [], setoresFiltrados: [], funcionarios: [], unidadeContextualId: getScopedUnitId(req) }));
    }

    const { operationalUnitId, operationalUnit, principalUnitId } = await loadScopedOperationalUnitContextForFuncionariosPage(req);
    if (operationalUnitId) {
      const [funcoesContextuais, setoresContextuais, funcionarios] = await Promise.all([
        principalUnitId ? findFuncoesByUnidadePrincipalPopuladas(principalUnitId) : [],
        findSetoresByUnidadeIdPopulateLean(operationalUnitId),
        findFuncionariosParaListagemComRefsSelectLean({ unidade_id: operationalUnitId }),
      ]);

      const funcoesFiltradas = (funcoesContextuais || []).map((funcao) => ({
        _id: funcao._id,
        codigo: funcao.codigo,
        nome: funcao.nome,
        descricao: funcao.descricao || '',
      }));

      const setoresFiltrados = (setoresContextuais || []).map((setor) => ({
        _id: setor._id,
        nome: setor.nome,
        descricao: setor.descricao || '',
      }));

      return res.render('funcionarios/funcionarios_index', {
        user: req.user,
        unidadesFiltradas: operationalUnit ? [operationalUnit] : [],
        funcoesFiltradas,
        setoresFiltrados,
        funcionarios,
        unidadeContextualId: operationalUnitId,
      });
    }

    const privilegedUser = isPrivilegedGestorUser(req.user);
    if (!privilegedUser) {
      return res.render('funcionarios/funcionarios_index', {
        user: req.user,
        unidadesFiltradas: [],
        funcoesFiltradas: [],
        setoresFiltrados: [],
        funcionarios: [],
        unidadeContextualId: operationalUnitId || '',
      });
    }

    const [unidadesFiltradas, funcoesFiltradas, setoresFiltrados, funcionarios] = await Promise.all([
      findUnidadesByCondSelectCodigoNomeOrdenadasLean({ ativa: true }),
      findFuncoesAtivasNomeOrdenadasSelectLean(),
      findSetoresByCondNomeOrdenadosSelectLean({ ativo: true }),
      findFuncionariosParaListagemComRefsSelectLean({}),
    ]);
    return res.render('funcionarios/funcionarios_index', { user: req.user, unidadesFiltradas, funcoesFiltradas, setoresFiltrados, funcionarios, unidadeContextualId: operationalUnitId || '' });
  } catch (e) {
    console.error('[pagesController] /funcionarios erro:', e && (e.stack || e.message || e));
    // Fallback: renderizar página vazia para evitar 500 e permitir diagnóstico no front
    try {
      return res.status(200).render('funcionarios/funcionarios_index', stubCtx(req, { unidadesFiltradas: [], funcoesFiltradas: [], setoresFiltrados: [], funcionarios: [], unidadeContextualId: getScopedUnitId(req) }));
    } catch (e2) {
      console.error('[pagesController] /funcionarios fallback render falhou:', e2 && (e2.stack || e2.message || e2));
      return res.status(500).send('Erro ao carregar funcionários');
    }
  }
}

export async function paginaRecursos(req, res) {
  try {
    const privilegedUser = isPrivilegedGestorUser(req.user);
    if (isDbOff(req)) {
      return res.status(200).render('recursos', stubCtx(req, { unidadesFiltradas: [] }));
    }
    const unidadeContextual = await loadScopedUnidadeForPage(req);
    let unidadesFiltradas = unidadeContextual ? [unidadeContextual] : [];

    if ((!unidadesFiltradas || unidadesFiltradas.length === 0) && privilegedUser) {
      // Fallback legado isolado: sessão privilegiada ainda sem unitScope contextual ativo.
      unidadesFiltradas = await findAllUnidadesLean();
    }

    if ((!unidadesFiltradas || unidadesFiltradas.length === 0) && privilegedUser) {
      const matrizes = await findUnidadesPrincipaisLean();
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
    const privilegedUser = isPrivilegedGestorUser(req.user);
    if (isDbOff(req)) {
      return res.status(200).render('setor', stubCtx(req, { setoresFiltrados: [], unidadesFiltradas: [] }));
    }
    const scopedUnitId = getScopedUnitId(req);

    if (scopedUnitId) {
      const [unidadeContextual, setoresFiltrados] = await Promise.all([
        loadScopedUnidadeForPage(req),
        findSetoresByCondDescricaoPopulateUnidadeOrdenadosLean({ ativo: true, unidade_id: scopedUnitId }),
      ]);

      return res.render('setor', {
        setoresFiltrados,
        unidadesFiltradas: unidadeContextual ? [unidadeContextual] : [],
        user: req.user,
      });
    }

    let unidadesFiltradas = [];
    let setoresFiltrados = [];

    if (privilegedUser) {
      // Fallback legado isolado: sessão privilegiada ainda sem unitScope contextual ativo.
      unidadesFiltradas = await findUnidadesForSetorPageSelectLean();
      setoresFiltrados = await findSetoresByCondDescricaoPopulateUnidadeOrdenadosLean({ ativo: true });
    }

    if ((!setoresFiltrados || setoresFiltrados.length === 0) && privilegedUser) {
      // fallback: tenta todos setores
      setoresFiltrados = await findSetoresByCondDescricaoPopulateUnidadeOrdenadosLean({});
      if ((!unidadesFiltradas || unidadesFiltradas.length === 0) && setoresFiltrados?.length) {
        const uids = [...new Set(setoresFiltrados.map(s => String(s.unidade_id?._id || s.unidade_id)).filter(Boolean))];
        unidadesFiltradas = await findUnidadesForSetorPageByIdsSelectLean(uids);
      }
    }

    return res.render('setor', { setoresFiltrados, unidadesFiltradas, user: req.user });
  } catch (e) {
    console.error('[pagesController] /setores erro:', e.message);
    return res.status(500).send('Erro ao carregar setores');
  }
}
