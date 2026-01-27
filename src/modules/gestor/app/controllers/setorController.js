// Controller de Setores (migrado)
import Setor from '#models/setor.js';
import Unidade from '#models/unidade.js';
export async function listarSetores(req, res) {
  try {
    // Inclui setores legados que talvez não tenham o campo 'ativo' definido (null/undefined)
    const filtroAtivo = { $or: [ { ativo: true }, { ativo: { $exists: false } } ] };
    const setores = await Setor.find(filtroAtivo)
      .select('nome descricao unidade_id')
      .populate({ path:'unidade_id', select:'nome codigo' })
      .sort({ nome:1 })
      .lean();
    const setoresFiltrados = setores.map(s => ({
      ...s,
      unidade_nome: s.unidade_id ? (s.unidade_id.codigo ? `${s.unidade_id.codigo} - ${s.unidade_id.nome || ''}`.trim() : (s.unidade_id.nome || s.unidade_id.codigo)) : ''
    }));
    const unidades = await Unidade.find({ ativa: true }).select('nome codigo').sort({ nome:1 }).lean();
    const unidadesFiltradas = unidades.map(u => ({
      _id: u._id,
      id: u._id,
      nome: u.nome,
      codigo: u.codigo
    }));
    return res.render('setor', { setoresFiltrados, unidadesFiltradas, user: req.user });
  } catch (e) {
    return res.status(500).send('Erro ao carregar setores');
  }
}
export default { listarSetores };
