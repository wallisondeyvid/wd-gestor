// Controller de Módulos (migrado)
import Modulo from '#models/modulo.js';
export async function listarModulos(req, res) {
  try {
    if (!req.user.isMaster && req.user.role !== 'admin') return res.status(403).send('Acesso negado');
    const modulos = await Modulo.find();
    return res.render('slots-modulos', { modulos, user: req.user });
  } catch (e) {
    return res.status(500).send('Erro ao carregar módulos');
  }
}
export default { listarModulos };
