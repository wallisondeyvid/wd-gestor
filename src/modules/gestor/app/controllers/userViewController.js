// Controller de Usuários (view) - separado de APIs já migradas
import User from '#models/user.js';
import Unidade from '#models/unidade.js';
import Funcionario from '#models/Funcionario.js';

export async function listarUsuarios(req, res, next) {
  try {
    if (!req.user.isMaster && req.user.role !== 'admin') return res.status(403).send('Acesso negado');
    const query = req.user.isMaster ? {} : { role: { $ne: 'master' } };
    const usuarios = await User.find(query).lean();
    const unidadesFiltradas = await Unidade.find().select('_id codigo nome').lean();
    const funcionarios = await Funcionario.find().select('_id nome cpf').lean();
    return res.render('usuarios', { usuarios, user: req.user, unidadesFiltradas, funcionarios });
  } catch (e) {
    console.error('Erro na rota /usuarios:', e);
    return next(e);
  }
}
export default { listarUsuarios };
