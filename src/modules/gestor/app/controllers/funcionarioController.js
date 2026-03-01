// Controller de Funcionários (migrado)
import {
  findUnidadesAtivasCodigoNomeOrdenadasSelectLean,
  findFuncoesAtivasNomeOrdenadasSelectLean,
  findSetoresAtivosNomeOrdenadosSelectLean,
  findFuncionariosParaListagemComRefsSelectLean,
  findFuncionariosDisponiveisSemUsuarioPorUnidadeSelectLean,
} from '#modules/gestor/app/db/api.db.js';

export async function listarFuncionarios(req, res) {
  try {
    const filtro = {};
    if (req.user?.role !== 'master' && req.user?.unidade_id) filtro.unidade_id = req.user.unidade_id;
    const [unidadesFiltradas, funcoesFiltradas, setoresFiltrados, funcionarios] = await Promise.all([
      findUnidadesAtivasCodigoNomeOrdenadasSelectLean(),
      findFuncoesAtivasNomeOrdenadasSelectLean(),
      findSetoresAtivosNomeOrdenadosSelectLean(),
      findFuncionariosParaListagemComRefsSelectLean(filtro),
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
    const funcionarios = await findFuncionariosDisponiveisSemUsuarioPorUnidadeSelectLean(unidadeId);
    return res.json({ success: true, funcionarios: funcionarios || [] });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Erro interno do servidor', funcionarios: [] });
  }
}
export default { listarFuncionarios, funcionariosDisponiveis };
