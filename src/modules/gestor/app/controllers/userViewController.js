// Controller de Usuários (view) - separado de APIs já migradas
import {
  findUsersByQueryLean,
  findAllUnidadesSelectIdCodigoNomeLean,
  findAllFuncionariosSelectIdNomeCpfLean,
} from '#modules/gestor/app/services/legacy/apiDbBridgeService.js';

export async function listarUsuarios(req, res, next) {
  try {
    if (!req.user.isMaster && req.user.role !== 'admin') return res.status(403).send('Acesso negado');
    const query = req.user.isMaster ? {} : { role: { $ne: 'master' } };
    const usuarios = await findUsersByQueryLean(query);
    const unidadesFiltradas = await findAllUnidadesSelectIdCodigoNomeLean();
    const funcionarios = await findAllFuncionariosSelectIdNomeCpfLean();
    return res.render('usuarios', { usuarios, user: req.user, unidadesFiltradas, funcionarios });
  } catch (e) {
    console.error('Erro na rota /usuarios:', e);
    return next(e);
  }
}
export default { listarUsuarios };
