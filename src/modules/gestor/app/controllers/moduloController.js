// Controller de Módulos (migrado)
import { findAllModulos } from '#modules/gestor/app/services/apiDbBridgeService.js';
export async function listarModulos(req, res) {
  try {
    if (!req.user.isMaster && req.user.role !== 'admin') return res.status(403).send('Acesso negado');
    const modulos = await findAllModulos();
    return res.render('slots-modulos', { modulos, user: req.user });
  } catch (e) {
    return res.status(500).send('Erro ao carregar módulos');
  }
}
export default { listarModulos };
