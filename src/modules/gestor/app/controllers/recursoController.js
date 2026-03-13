// Controller de Recursos (migrado)
import { findAllUnidadesLean, findUnidadeByIdLean } from '#modules/gestor/app/services/apiDbBridgeService.js';

function normalizeId(value) {
  return String(value || '').trim();
}

function isPrivilegedGestorUser(user) {
  return user?.isMaster === true || user?.role === 'master' || user?.role === 'admin';
}

function getScopedUnitId(req) {
  return normalizeId(req?.unitScope?.unidadeId);
}

export async function listarRecursos(req, res) {
  try {
    const scopedUnitId = getScopedUnitId(req);
    let unidadesFiltradas = [];

    if (scopedUnitId) {
      const unidadeContextual = await findUnidadeByIdLean(scopedUnitId);
      unidadesFiltradas = unidadeContextual ? [unidadeContextual] : [];
    } else if (isPrivilegedGestorUser(req.user)) {
      unidadesFiltradas = await findAllUnidadesLean();
    }

    return res.render('recursos', { unidadesFiltradas, user: req.user || { nome: 'Usuário Desconhecido', id: null } });
  } catch (error) {
    return res.status(500).render('erro', { errorMessage: 'Erro ao carregar recursos: ' + error.message });
  }
}
export default { listarRecursos };
