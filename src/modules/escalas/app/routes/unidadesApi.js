import { Router } from 'express';

// Carrega modelo de Unidade de forma lazy para evitar custos se não usado
async function getUnidadeModel(){
  try {
    const mod = await import('#models/unidade.js');
    return mod.default || mod.Unidade || mod;
  } catch (e1) {
    // Fallback quando o alias #core não está resolvendo neste módulo (ambiente sem path aliases)
    try {
      const mod2 = await import('#models/unidade.js');
      return mod2.default || mod2.Unidade || mod2;
    } catch (e2) {
      // Fallback final: tentar caminho padrão do projeto em /models/unidade.js
      try {
        const mod3 = await import('#models/unidade.js');
        return mod3.default || mod3.Unidade || mod3;
      } catch (e3) {
        console.error('[unidadesApi] Falha ao carregar modelo Unidade (alias/core/models e models root):',
          '\n - alias:#core ->', e1?.message || e1,
          '\n - src/core ->', e2?.message || e2,
          '\n - models root ->', e3?.message || e3
        );
        throw e3 || e2 || e1;
      }
    }
  }
}

const router = Router();

function getRequestUser(req) {
  return req.user || req.session.escalasUser || req.session.user || {};
}

function mapObservableUnit(unidade) {
  return {
    id: unidade._id,
    codigo: unidade.codigo || null,
    nome: unidade.nome,
    is_principal: !!unidade.is_principal,
  };
}

function sortUnitsWithMatricesFirst(unidades) {
  unidades.sort((a, b) => {
    if (!!b.is_principal - !!a.is_principal !== 0) return (!!b.is_principal - !!a.is_principal);
    const codigoCompare = (a.codigo || '').localeCompare(b.codigo || '');
    if (codigoCompare !== 0) return codigoCompare;
    return (a.nome || '').localeCompare(b.nome || '');
  });
  return unidades;
}

function sortUnitsByCodeThenName(unidades) {
  unidades.sort((a, b) => {
    const codigoCompare = (a.codigo || '').localeCompare(b.codigo || '');
    if (codigoCompare !== 0) return codigoCompare;
    return (a.nome || '').localeCompare(b.nome || '');
  });
  return unidades;
}

function resolveMatrizId(unidade) {
  if (unidade.is_principal) return unidade._id;
  if (unidade.unidade_principal_id) return unidade.unidade_principal_id;
  return unidade._id;
}

async function buildOrderedClusterUnits(Unidade, matrizId, campos) {
  const filtro = { $or: [{ _id: matrizId }, { unidade_principal_id: matrizId }] };
  const todas = await Unidade.find(filtro).select(campos).lean();
  const matriz = todas.find((unidade) => String(unidade._id) === String(matrizId));
  const filiais = todas.filter((unidade) => String(unidade._id) !== String(matrizId));
  sortUnitsByCodeThenName(filiais);
  return [matriz, ...filiais].filter(Boolean);
}

// Middleware simples garantindo usuário logado no módulo Escalas
function requireEscalasAuth(req, res, next){
  // Aceita sessão do módulo Escalas, sessão geral do Gestor ou usuário já populado
  if (req.session?.escalasUser || req.session?.user || req.user) return next();
  return res.status(401).json({ error: 'Não autenticado' });
}

// GET /api/unidades-relacionadas
// Retorna: matriz + filiais do mesmo grupo da unidade do usuário logado.
// Caso usuário esteja vinculado a uma filial: usa unidade_principal_id para determinar grupo.
// Caso usuário esteja vinculado a uma matriz (is_principal=true): retorna a própria e todas filiais.
// Caso usuário não tenha unidade_id: retorna lista vazia.
router.get('/api/unidades-relacionadas', requireEscalasAuth, async (req, res) => {
  try {
    const usuario = getRequestUser(req);
    const unidadeId = usuario.unidade_id || usuario.unidadeId || null;
    const isMaster = !!(usuario.isMaster || usuario.role === 'master');
    const isAdmin = !!(usuario.role === 'admin');

    const Unidade = await getUnidadeModel();

    // Caso usuário master: retorna todas as unidades (sem filtro de cluster)
    if(isMaster || isAdmin){
      const campos = 'codigo nome is_principal unidade_principal_id';
      const todas = await Unidade.find({}).select(campos).lean();
      sortUnitsWithMatricesFirst(todas);
      const data = todas.map(mapObservableUnit);
      return res.json({ data, master: isMaster, admin: isAdmin });
    }

    // Fallback: se o usuário não tiver unidade vinculada, retorna pelo menos as matrizes para permitir seleção
    if(!unidadeId){
      const campos = 'codigo nome is_principal unidade_principal_id';
      const matrizes = await Unidade.find({ is_principal: true }).select(campos).lean();
      sortUnitsByCodeThenName(matrizes);
      const data = matrizes.map(mapObservableUnit);
      return res.json({ data, fallback: 'no-unidade-matrizes' });
    }

    const unidadeUser = await Unidade.findById(unidadeId).lean();
    if(!unidadeUser) return res.json({ data: [] });

    const campos = 'codigo nome is_principal unidade_principal_id';
    const matrizId = resolveMatrizId(unidadeUser);
    const ordered = await buildOrderedClusterUnits(Unidade, matrizId, campos);
    const data = ordered.map(mapObservableUnit);
    return res.json({ data });
  } catch(e){
    console.error('[escalas][api/unidades-relacionadas] erro:', e);
    return res.status(500).json({ error: 'Falha ao listar unidades' });
  }
});

export default router;
