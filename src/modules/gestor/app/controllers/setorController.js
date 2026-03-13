// Controller de Setores (migrado)
import {
  findSetoresByCondDescricaoPopulateUnidadeOrdenadosLean,
  findUnidadeByIdLean,
  findUnidadesAtivasNomeCodigoOrdenadasLean,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

function normalizeId(value) {
  return String(value || '').trim();
}

function isPrivilegedGestorUser(user) {
  return user?.isMaster === true || user?.role === 'master' || user?.role === 'admin';
}

function getScopedUnitId(req) {
  return normalizeId(req?.unitScope?.unidadeId);
}

export async function listarSetores(req, res) {
  try {
    // Inclui setores legados que talvez não tenham o campo 'ativo' definido (null/undefined)
    const filtroAtivo = { $or: [ { ativo: true }, { ativo: { $exists: false } } ] };
    const scopedUnitId = getScopedUnitId(req);
    if (scopedUnitId) filtroAtivo.unidade_id = scopedUnitId;

    const setores = await findSetoresByCondDescricaoPopulateUnidadeOrdenadosLean(filtroAtivo);
    const setoresFiltrados = setores.map(s => ({
      ...s,
      unidade_nome: s.unidade_id ? (s.unidade_id.codigo ? `${s.unidade_id.codigo} - ${s.unidade_id.nome || ''}`.trim() : (s.unidade_id.nome || s.unidade_id.codigo)) : ''
    }));
    let unidades = [];
    if (scopedUnitId) {
      const unidadeContextual = await findUnidadeByIdLean(scopedUnitId);
      unidades = unidadeContextual ? [unidadeContextual] : [];
    } else if (isPrivilegedGestorUser(req.user)) {
      unidades = await findUnidadesAtivasNomeCodigoOrdenadasLean();
    }

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
