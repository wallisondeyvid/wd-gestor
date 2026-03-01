// Controller de Funções (view) - migrado do legado
import {
  findAllFuncoesPopuladas,
  findFuncoesByUnidadePrincipalPopuladas,
  findAllModulos,
  findUnidadesPrincipais,
  findUnidadesById,
} from '#modules/gestor/app/db/api.db.js';

export async function listarFuncoes(req, res) {
  try {
    const funcoesFiltradas = req.user.isMaster
      ? await findAllFuncoesPopuladas()
      : await findFuncoesByUnidadePrincipalPopuladas(req.user.unidade_principal_id);
    const modulosFiltrados = await findAllModulos();
    const unidadesPrincipaisFiltradas = req.user.isMaster
      ? await findUnidadesPrincipais()
      : await findUnidadesById(req.user.unidade_principal_id);
    return res.render('funcoes', { funcoesFiltradas, modulosFiltrados, unidadesPrincipaisFiltradas, user: req.user });
  } catch (e) {
    return res.status(500).send('Erro ao carregar funções');
  }
}

export default { listarFuncoes };
