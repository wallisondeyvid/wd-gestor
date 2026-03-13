// pagesController.js - migrado para módulo Gestor (views)
import fs from 'fs';
import path from 'path';
import {
  findUsuariosDiretorAtivosPopulatedLean,
  findFuncionariosByEmailsSelectEmailNomeLean,
  findUsersByQueryLean,
  findAllUnidadesSelectIdCodigoNomeLean,
  findAllFuncionariosSelectIdNomeCpfLean,
  findUserMembershipsByUserIdsLean,
  findAllUnidades,
  findUnidadesByMatrizOuPrincipal,
  findUnidadesById,
  findUnidadesByIdsNomeCodigoLean,
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
  findUnidadesByCondLean,
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

function buildUnidadeMembershipLabel(unidade) {
  const codigo = String(unidade?.codigo || '').trim();
  const nome = String(unidade?.nome || '').trim();
  if (codigo && nome) return `${codigo} - ${nome}`;
  return nome || codigo || null;
}

async function withUsuariosMembershipsSummary(usuarios) {
  if (!Array.isArray(usuarios) || usuarios.length === 0) return usuarios || [];

  const userIds = [...new Set(usuarios.map((usuario) => normalizeId(usuario?._id)).filter(Boolean))];
  if (userIds.length === 0) {
    return usuarios.map((usuario) => ({ ...usuario, membershipsSummary: [], membershipsCount: 0 }));
  }

  const memberships = await findUserMembershipsByUserIdsLean(userIds);
  if (!Array.isArray(memberships) || memberships.length === 0) {
    return usuarios.map((usuario) => ({ ...usuario, membershipsSummary: [], membershipsCount: 0 }));
  }

  const unidadeIds = [...new Set(memberships.map((membership) => normalizeId(membership?.unidade_id)).filter(Boolean))];
  const unidades = unidadeIds.length > 0 ? await findUnidadesByIdsNomeCodigoLean(unidadeIds) : [];
  const unidadesById = new Map(
    (Array.isArray(unidades) ? unidades : []).map((unidade) => [normalizeId(unidade?._id), unidade])
  );
  const membershipsByUserId = new Map();

  memberships.forEach((membership) => {
    const userId = normalizeId(membership?.user_id);
    if (!userId) return;

    const unidadeId = normalizeId(membership?.unidade_id);
    const unidade = unidadesById.get(unidadeId) || null;
    const currentSummary = membershipsByUserId.get(userId) || [];

    currentSummary.push({
      unidade_id: unidadeId,
      unidade_nome: buildUnidadeMembershipLabel(unidade) || unidadeId,
      papel_contextual: String(membership?.papel_contextual || '').trim() || null,
      status: String(membership?.status || '').trim() || null,
      funcionario_id: normalizeId(membership?.funcionario_id) || null,
    });

    membershipsByUserId.set(userId, currentSummary);
  });

  return usuarios.map((usuario) => {
    const membershipsSummary = membershipsByUserId.get(normalizeId(usuario?._id)) || [];
    return {
      ...usuario,
      membershipsSummary,
      membershipsCount: membershipsSummary.length,
    };
  });
}

async function carregarUsuariosDiretor(req) {
  if (!(req.user?.isMaster || req.user?.role === 'admin')) return [];
  let usuariosDiretor = await findUsuariosDiretorAtivosPopulatedLean();
  const faltando = usuariosDiretor.filter(u => !((u.nome && u.nome.trim()) || (u.funcionario_id && u.funcionario_id.nome)) && u.email);
  if (faltando.length) {
    const emails = [...new Set(faltando.map(f => f.email.toLowerCase()))];
    try {
      const funcs = await findFuncionariosByEmailsSelectEmailNomeLean(emails);
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
    const usuarios = await withUsuariosMembershipsSummary(await findUsersByQueryLean(query));
    const unidadesFiltradas = await findAllUnidadesSelectIdCodigoNomeLean();
    const funcionarios = await findAllFuncionariosSelectIdNomeCpfLean();
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
    const scopedContext = await loadScopedUnidadesClusterForPage(req);
    let unidadesFiltradas;
    if (scopedContext.scopedUnitId) {
      unidadesFiltradas = scopedContext.unidadesFiltradas;
      console.log('[paginaUnidades] Unidades filtradas via unitScope:', unidadesFiltradas.length);
    } else if (isMaster) {
      console.log('[DEBUG SERVER] Carregando todas unidades para master');
      unidadesFiltradas = await findAllUnidades();
      console.log('[DEBUG SERVER] Unidades encontradas:', unidadesFiltradas.length);
    } else {
      // Fallback legado isolado: só usado quando ainda não há unitScope canônico.
      const matrizRef = req.user.unidade_principal_id || req.user.unidade_id;
      unidadesFiltradas = matrizRef ? await findUnidadesByMatrizOuPrincipal(matrizRef) : [];
      if ((!unidadesFiltradas || unidadesFiltradas.length === 0) && req.user.unidade_id) {
        unidadesFiltradas = await findUnidadesById(req.user.unidade_id);
      }
      console.log('[paginaUnidades] Unidades filtradas para user:', unidadesFiltradas.length);
      // Fallback: se ainda vazio mas usuário possui permissão elevada (admin), tenta recuperar todas
      if ((!unidadesFiltradas || unidadesFiltradas.length === 0) && (req.user.role === 'admin')) {
        try {
          const todas = await findAllUnidades();
          if (todas && todas.length) {
            console.warn('[paginaUnidades] Fallback admin => carregando todas as unidades');
            unidadesFiltradas = todas;
          }
        } catch(_e){}
      }
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
    if (principalUnits.length === 0 && req.user.unidade_principal_id) { const principalDoc = await findUnidadeByIdLean(req.user.unidade_principal_id); if (principalDoc) principalUnits = [principalDoc]; }
    if (principalUnits.length === 0 && req.user.unidade_id) { const doc = await findUnidadeByIdLean(req.user.unidade_id); if (doc) principalUnits = [doc]; }
    const modulos = (isMaster || req.user.role === 'admin') ? await findAllModulosLean() : await findModulosAtivosStatusLean();
    if ((!unidadesFiltradas || unidadesFiltradas.length === 0) && isMaster) {
      console.warn('[paginaUnidades] ALERTA: master sem unidades visíveis — verificando fallback matrizes');
      try {
        const matrizes = await findUnidadesPrincipaisLean();
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
    const unidade = await findUnidadeById(unidadeId);
    if (!unidade) return res.status(404).send('Unidade não encontrada.');
    let unidadesFiltradas;
    const scopedContext = await loadScopedUnidadesClusterForPage(req);
    if (scopedContext.scopedUnitId) {
      unidadesFiltradas = scopedContext.unidadesFiltradas;
      const permitidoIds = new Set(unidadesFiltradas.map(u => String(u._id)));
      if (!permitidoIds.has(String(unidade._id))) return res.status(403).send('Acesso à unidade não autorizado');
    } else if (req.user.isMaster) { unidadesFiltradas = await findAllUnidades(); }
    else {
      // Fallback legado isolado: só usado quando ainda não há unitScope canônico.
      const matrizRef = req.user.unidade_principal_id || req.user.unidade_id;
      unidadesFiltradas = matrizRef ? await findUnidadesByMatrizOuPrincipal(matrizRef) : [];
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
    const isMaster = isMasterLike(req.user);
    if (isDbOff(req)) {
      return res.status(200).render('funcoes', stubCtx(req, { funcoesFiltradas: [], modulosFiltrados: [], unidadesPrincipaisFiltradas: [] }));
    }

    const { principalUnitId, principalUnit } = await loadScopedUnitContextForPage(req);
    if (principalUnitId) {
      const [funcoesFiltradas, modulosFiltrados] = await Promise.all([
        findFuncoesByUnidadePrincipalPopuladas(principalUnitId),
        findAllModulos(),
      ]);

      return res.render('funcoes', {
        funcoesFiltradas,
        modulosFiltrados,
        unidadesPrincipaisFiltradas: principalUnit ? [principalUnit] : [],
        user: req.user,
      });
    }

    let funcoesFiltradas;
    if (isMaster || req.user.role === 'admin') {
      funcoesFiltradas = await findAllFuncoesPopuladas();
    } else {
      funcoesFiltradas = await findFuncoesByUnidadePrincipalPopuladas(req.user.unidade_principal_id);
    }
    if ((!funcoesFiltradas || funcoesFiltradas.length === 0) && (isMaster || req.user.role === 'admin')) {
      // fallback: tentar ao menos por matrizes
      const matrizes = await findUnidadesPrincipaisSelectIdLean();
      const ids = matrizes.map(m => m._id);
      funcoesFiltradas = await findFuncoesByUnidadePrincipalIdsPopuladas(ids);
    }
    const modulosFiltrados = await findAllModulos();
    const unidadesPrincipaisFiltradas = isMaster || req.user.role === 'admin' ? await findUnidadesPrincipais() : await findUnidadesById(req.user.unidade_principal_id);
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
      return res.status(200).render('funcionarios/funcionarios_index', stubCtx(req, { unidadesFiltradas: [], funcoesFiltradas: [], setoresFiltrados: [], funcionarios: [], unidadeContextualId: getScopedUnitId(req) }));
    }

    const { scopedUnitId, scopedUnit, principalUnitId } = await loadScopedUnitContextForPage(req);
    if (scopedUnitId) {
      const [funcoesContextuais, setoresContextuais, funcionarios] = await Promise.all([
        principalUnitId ? findFuncoesByUnidadePrincipalPopuladas(principalUnitId) : [],
        findSetoresByUnidadeIdPopulateLean(scopedUnitId),
        findFuncionariosParaListagemComRefsSelectLean({ unidade_id: scopedUnitId }),
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
        unidadesFiltradas: scopedUnit ? [scopedUnit] : [],
        funcoesFiltradas,
        setoresFiltrados,
        funcionarios,
        unidadeContextualId: scopedUnitId,
      });
    }

    const privilegedUser = !!(req.user?.isMaster || req.user?.role === 'admin');
    const filtro = {};
    if (!req.user?.isMaster && req.user?.unidade_id) filtro.unidade_id = req.user.unidade_id;

    // Calcular escopo de unidades (matriz + filiais) para o usuário
    let unidadesCond = { ativa: true };
    let principalIdLegado = '';
    if (!privilegedUser) {
      principalIdLegado = req.user?.unidade_principal_id;
      if (!principalIdLegado && req.user?.unidade_id) {
        const u = await findUnidadeUserBaseLean(req.user.unidade_id);
        if (u) principalIdLegado = u.is_principal ? u._id : (u.unidade_principal_id || u.matriz_id || u._id);
      }
      unidadesCond = principalIdLegado ? { $or: [ { _id: principalIdLegado }, { unidade_principal_id: principalIdLegado }, { matriz_id: principalIdLegado } ] } : { _id: req.user?.unidade_id || null };
    }

    // Filtro de setores conforme escopo calculado
    let setoresCond = { ativo: true };
    if (!privilegedUser) {
      const unidadesAcessiveis = await findUnidadesByCondLean(unidadesCond);
      const ids = unidadesAcessiveis.map(u => u._id);
      setoresCond.unidade_id = { $in: ids };
    }

    const funcoesPromise = privilegedUser
      ? findFuncoesAtivasNomeOrdenadasSelectLean()
      : principalIdLegado
        ? findFuncoesByUnidadePrincipalPopuladas(principalIdLegado).then((funcoes) => (funcoes || []).map((funcao) => ({
          _id: funcao._id,
          codigo: funcao.codigo,
          nome: funcao.nome,
          descricao: funcao.descricao || '',
        })))
        : [];

    const [unidadesFiltradas, funcoesFiltradas, setoresFiltrados, funcionarios] = await Promise.all([
      findUnidadesByCondSelectCodigoNomeOrdenadasLean(unidadesCond),
      funcoesPromise,
      findSetoresByCondNomeOrdenadosSelectLean(setoresCond),
      findFuncionariosParaListagemComRefsSelectLean(filtro),
    ]);
    return res.render('funcionarios/funcionarios_index', { user: req.user, unidadesFiltradas, funcoesFiltradas, setoresFiltrados, funcionarios, unidadeContextualId: scopedUnitId });
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
