// Controller de Funções (view) - migrado do legado
import Funcao from '#models/funcao.js';
import Modulo from '#models/modulo.js';
import Unidade from '#models/unidade.js';

export async function listarFuncoes(req, res) {
  try {
    const funcoesFiltradas = req.user.isMaster
      ? await Funcao.find().populate('unidade_principal_id modulos_habilitados')
      : await Funcao.find({ unidade_principal_id: req.user.unidade_principal_id }).populate('unidade_principal_id modulos_habilitados');
    const modulosFiltrados = await Modulo.find();
    const unidadesPrincipaisFiltradas = req.user.isMaster
      ? await Unidade.find({ is_principal: true })
      : await Unidade.find({ _id: req.user.unidade_principal_id });
    return res.render('funcoes', { funcoesFiltradas, modulosFiltrados, unidadesPrincipaisFiltradas, user: req.user });
  } catch (e) {
    return res.status(500).send('Erro ao carregar funções');
  }
}

export default { listarFuncoes };
