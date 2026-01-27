// Controller de Funcionários (migrado)
import Funcionario from '#models/Funcionario.js';
import Unidade from '#models/unidade.js';
import Funcao from '#models/funcao.js';
import Setor from '#models/setor.js';

export async function listarFuncionarios(req, res) {
  try {
    const filtro = {};
    if (req.user?.role !== 'master' && req.user?.unidade_id) filtro.unidade_id = req.user.unidade_id;
    const [unidadesFiltradas, funcoesFiltradas, setoresFiltrados, funcionarios] = await Promise.all([
      Unidade.find({ ativa: true }).select('codigo nome').sort({ nome: 1 }).lean(),
      Funcao.find({ ativa: true }).select('nome').sort({ nome: 1 }).lean(),
      Setor.find({ ativo: true }).select('nome').sort({ nome: 1 }).lean(),
      Funcionario.find(filtro)
        .select('nome cpf unidade_id funcao_id ativo')
        .populate({ path: 'unidade_id', select: 'nome' })
        .populate({ path: 'funcao_id',  select: 'nome' })
        .sort({ nome: 1 })
        .lean(),
    ]);
    return res.render('funcionarios/funcionarios_index', { user: req.user, unidadesFiltradas, funcoesFiltradas, setoresFiltrados, funcionarios });
  } catch (err) {
    return res.status(500).send('Erro ao carregar funcionários');
  }
}

export async function funcionariosDisponiveis(req, res) {
  try {
    const { unidadeId } = req.params;
    if (!unidadeId || unidadeId === 'undefined' || unidadeId === 'null') return res.json({ funcionarios: [] });
    const funcionarios = await Funcionario.find({
      unidade_id: unidadeId,
      $or: [ { usuario_id: { $exists: false } }, { usuario_id: null } ]
    })
      .select('_id nome cpf')
      .sort({ nome: 1 })
      .lean();
    return res.json({ success: true, funcionarios: funcionarios || [] });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Erro interno do servidor', funcionarios: [] });
  }
}
export default { listarFuncionarios, funcionariosDisponiveis };
