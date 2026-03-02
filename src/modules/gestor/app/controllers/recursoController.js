// Controller de Recursos (migrado)
import { findAllUnidadesLean, findUnidadeByIdLean, findUnidadesByCondLeanFull } from '#modules/gestor/app/services/legacy/apiDbBridgeService.js';
export async function listarRecursos(req, res) {
  try {
    let unidadesFiltradas = [];
    if (req.user.isMaster) {
      unidadesFiltradas = await findAllUnidadesLean();
    } else {
      let principalId = req.user.unidade_principal_id;
      if (!principalId && req.user.unidade_id) {
        const u = await findUnidadeByIdLean(req.user.unidade_id);
        if (u) principalId = u.is_principal ? u._id : u.unidade_principal_id;
      }
      const cond = principalId ? { $or: [{ _id: principalId }, { unidade_principal_id: principalId }] } : {};
      unidadesFiltradas = await findUnidadesByCondLeanFull(cond);
    }
    return res.render('recursos', { unidadesFiltradas, user: req.user || { nome: 'Usuário Desconhecido', id: null } });
  } catch (error) {
    return res.status(500).render('erro', { errorMessage: 'Erro ao carregar recursos: ' + error.message });
  }
}
export default { listarRecursos };
