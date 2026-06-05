// Controller de Unidades (migrado do legado)
import {
  findAllUnidades,
  findUnidadesByMatrizOuPrincipal,
  findUnidadesById,
  findUnidadeByIdLean,
  findAllUnidadesLean,
  findUnidadesAtivasStatusLean,
  findUsuariosDiretorAtivosPopulatedLean,
  findFuncionariosByEmailsSelectEmailNomeLean,
  findUnidadeById,
  saveUnidadeDoc,
} from '#modules/gestor/app/services/apiDbBridgeService.js';
import { BankPort } from '#shared/ports/bank.port.js';
import { resolveTestarBancoTargetService } from '#modules/gestor/app/services/unidades/resolveTestarBancoTarget.service.js';

function normalizeUnitId(value) {
  return String(value || '').trim();
}

function isPrivilegedGestorUser(user) {
  return user?.isMaster === true || user?.role === 'master' || user?.role === 'admin';
}

function buildSafeTokenPreview(token) {
  const value = String(token || '').trim();
  if (!value) return null;
  const visibleChars = Math.min(6, value.length);
  return `${value.slice(0, visibleChars)}...`;
}

async function ensureCanAccessUnidade(req, unidadeId) {
  const targetUnitId = normalizeUnitId(unidadeId);
  if (!targetUnitId) return false;

  const scopedUnitId = normalizeUnitId(req?.unitScope?.unidadeId);
  if (scopedUnitId) {
    const scopedUnit = await findUnidadeByIdLean(scopedUnitId);
    if (!scopedUnit) return false;

    const principalUnitId = normalizeUnitId(
      scopedUnit?.is_principal
        ? scopedUnit?._id
        : scopedUnit?.unidade_principal_id || scopedUnit?.matriz_id || scopedUnit?._id,
    );

    let unidadesPermitidas = principalUnitId
      ? await findUnidadesByMatrizOuPrincipal(principalUnitId)
      : [];

    if ((!unidadesPermitidas || unidadesPermitidas.length === 0) && scopedUnitId) {
      unidadesPermitidas = await findUnidadesById(scopedUnitId);
    }

    const permitidoIds = new Set(
      (unidadesPermitidas || []).map((unidade) => normalizeUnitId(unidade?._id)).filter(Boolean),
    );

    if (permitidoIds.size > 0) {
      return permitidoIds.has(targetUnitId);
    }

    return targetUnitId === scopedUnitId;
  }

  if (isPrivilegedGestorUser(req?.user)) return true;
  return false;
}

async function resolveTestarBancoTarget(req, unidadeId) {
  if (typeof resolveTestarBancoTargetService === 'function') {
    return resolveTestarBancoTargetService({ req, unidadeId });
  }

  const unidade = await findUnidadeById(unidadeId);
  if (!unidade) {
    return { kind: 'not_found', unidade: null };
  }

  const canAccess = await ensureCanAccessUnidade(req, unidade._id);
  if (!canAccess) {
    return { kind: 'forbidden', unidade: null };
  }

  return { kind: 'authorized', unidade };
}

export async function listarUnidades(req, res) {
  try {
    if (!req.user) return res.redirect('/login');
    let unidadesFiltradas;
    if (req.user.isMaster) {
      unidadesFiltradas = await findAllUnidades();
      try {
        const principais = unidadesFiltradas.filter(u => u.is_principal);
        if (principais.length === 1) {
          const idsExistentes = new Set(unidadesFiltradas.map(u => u._id.toString()));
            const orfas = unidadesFiltradas.filter(u => !u.is_principal && u.unidade_principal_id && !idsExistentes.has(u.unidade_principal_id.toString()));
            if (orfas.length) {
              await Promise.all(orfas.map(async f => { f.unidade_principal_id = principais[0]._id; try { await saveUnidadeDoc(f); } catch {} }));
              unidadesFiltradas = await findAllUnidades();
            }
        }
      } catch {}
    } else {
      const matrizRef = req.user.unidade_principal_id || req.user.unidade_id;
      if (matrizRef) {
        unidadesFiltradas = await findUnidadesByMatrizOuPrincipal(matrizRef);
      } else {
        unidadesFiltradas = [];
      }
      if ((!unidadesFiltradas || unidadesFiltradas.length === 0) && req.user.unidade_id) {
        const unica = await findUnidadesById(req.user.unidade_id);
        unidadesFiltradas = unica;
      }
    }
    unidadesFiltradas = unidadesFiltradas.map(u => {
      const plain = u.toObject();
      const apiBancaria = plain.apiBancaria ? { ...plain.apiBancaria } : {};
      if (apiBancaria.apiMtlsCertFileData) delete apiBancaria.apiMtlsCertFileData;
      return {
        ...plain,
        naturezaJuridica: u.naturezaJuridica || '',
        tipoPix: u.tipoPix || null,
        pixChave: u.pixChave || null,
        banco: u.banco || null,
        agencia: u.agencia || null,
        contaCorrente: u.contaCorrente || null,
        modulosAcessiveis: Array.isArray(u.modulosAcessiveis) ? u.modulosAcessiveis : [],
        apiBancaria
      };
    });
    let principalUnits = unidadesFiltradas.filter(u => u.is_principal);
    if (principalUnits.length === 0 && req.user.unidade_principal_id) {
      const principalDoc = await findUnidadeByIdLean(req.user.unidade_principal_id);
      if (principalDoc) principalUnits = [principalDoc];
    }
    if (principalUnits.length === 0 && req.user.unidade_id) {
      const doc = await findUnidadeByIdLean(req.user.unidade_id);
      if (doc) principalUnits = [doc];
    }
    const modulos = req.user.isMaster || req.user.role === 'admin'
      ? await findAllUnidadesLean()
      : await findUnidadesAtivasStatusLean();
    let usuariosDiretor = [];
    if (req.user.isMaster || req.user.role === 'admin') {
      usuariosDiretor = await findUsuariosDiretorAtivosPopulatedLean();
      const faltando = usuariosDiretor.filter(u => !((u.nome && u.nome.trim()) || (u.funcionario_id && u.funcionario_id.nome) || u.email));
      let mapaFuncPorEmail = {};
      if (faltando.length){
        const emails = [...new Set(faltando.map(f=>f.email?.toLowerCase()).filter(Boolean))];
        try {
          const funcs = await findFuncionariosByEmailsSelectEmailNomeLean(emails);
          funcs.forEach(f => { if(f.email) mapaFuncPorEmail[f.email.toLowerCase()] = f.nome; });
        } catch {}
      }
      usuariosDiretor = usuariosDiretor.map(u => {
        let nomeFinal = (u.nome && u.nome.trim()) ? u.nome.trim() : '';
        if (!nomeFinal && u.funcionario_id?.nome) nomeFinal = u.funcionario_id.nome.trim();
        if (!nomeFinal && u.email) {
          const viaMapa = mapaFuncPorEmail[u.email.toLowerCase()];
          if (viaMapa) nomeFinal = viaMapa.trim();
        }
        if (!nomeFinal && u.email) {
          try {
            const base = (u.email).split('@')[0].replace(/[._-]+/g,' ').replace(/\d+$/,'').trim();
            nomeFinal = base ? base.replace(/\b\w/g,m=>m.toUpperCase()) : '';
          } catch {}
        }
        u.nome = nomeFinal || '';
        return u;
      });
    }
    return res.render('unidades', { unidadesFiltradas, principalUnits, isMaster: req.user?.isMaster || false, user: req.user, estados: [], modulos, usuariosDiretor });
  } catch (error) {
    console.error('[listarUnidades] Erro ao carregar unidades:', error?.stack || error);
    return res.status(500).send('Erro ao carregar unidades');
  }
}

export async function testarBanco(req, res) {
  try {
    const { id: unidadeId } = req.params || {};
    if (!unidadeId) {
      return res.status(400).json({ ok: false, message: 'ID da unidade é obrigatório.' });
    }

    const target = await resolveTestarBancoTarget(req, unidadeId);
    if (target.kind === 'not_found') {
      return res.status(404).json({ ok: false, message: 'Unidade não encontrada.' });
    }

    if (target.kind === 'forbidden') {
      return res.status(400).json({ ok: false, message: 'Acesso à unidade não autorizado.' });
    }

    const { unidade } = target;

    const cfg = unidade.apiBancaria || {};
    if (!cfg.apiBaseUrl) {
      return res.status(400).json({ ok: false, message: 'Base URL da API bancária não configurada para esta unidade.' });
    }

    const tipo = cfg.tipoAutenticacaoAPI || '';
    let detalhe = '';
    let resultado = null;

    if (tipo === 'oauth2') {
      const token = await BankPort.getOAuthTokenFromConfig(cfg);
      const tokenPreview = typeof buildSafeTokenPreview === 'function'
        ? buildSafeTokenPreview(token)
        : `${String(token || '').slice(0, 6)}...`;
      detalhe = 'Token OAuth2 obtido com sucesso.';
      resultado = { tokenPreview };
    } else {
      const path = (req.body?.path || '/');
      const method = (req.body?.method || 'GET');
      const data = req.body?.data;
      resultado = await BankPort.callBankApi(unidadeId, { method, path, data });
      detalhe = `${method.toUpperCase()} ${path} executado com sucesso.`;
    }

    return res.json({ ok: true, message: 'Conexão com o banco testada com sucesso.', detalhe, resultado });
  } catch (err) {
    console.error('[unidades][testarBanco] Erro ao testar conexão bancária:', {
      name: err?.name || 'Error',
      code: err?.code || null,
    });
    return res.status(400).json({ ok: false, message: 'Falha ao testar conexão com o banco.' });
  }
}

export const unidadeControllerOrphan = { listarUnidades };
export const unidadeControllerLive = { testarBanco };

export default unidadeControllerLive;
