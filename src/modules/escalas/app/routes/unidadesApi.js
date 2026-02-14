import { Router } from 'express';

// Carrega modelo de Unidade de forma lazy para evitar custos se não usado
async function getUnidadeModel(){
  try {
    const mod = await import('#core/models/unidade.js');
    return mod.default || mod.Unidade || mod;
  } catch (e1) {
    // Fallback quando o alias #core não está resolvendo neste módulo (ambiente sem path aliases)
    try {
      const mod2 = await import('#core/models/unidade.js');
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
    const usuario = req.user || req.session.escalasUser || req.session.user || {};
    const unidadeId = usuario.unidade_id || usuario.unidadeId || null;
    const isMaster = !!(usuario.isMaster || usuario.role === 'master');
    const isAdmin = !!(usuario.role === 'admin');

    const Unidade = await getUnidadeModel();

    // Caso usuário master: retorna todas as unidades (sem filtro de cluster)
    if(isMaster || isAdmin){
      const campos = 'codigo nome is_principal unidade_principal_id';
      const todas = await Unidade.find({}).select(campos).lean();
      // Ordenar: matrizes primeiro, depois filiais por código, depois nome
      todas.sort((a,b)=>{
        if(!!b.is_principal - !!a.is_principal !== 0) return (!!b.is_principal - !!a.is_principal); // true antes de false
        const ca = (a.codigo||'').localeCompare(b.codigo||'');
        if(ca!==0) return ca;
        return (a.nome||'').localeCompare(b.nome||'');
      });
      const data = todas.map(u=>({ id:u._id, codigo:u.codigo||null, nome:u.nome, is_principal:!!u.is_principal }));
      return res.json({ data, master: isMaster, admin: isAdmin });
    }

    // Fallback: se o usuário não tiver unidade vinculada, retorna pelo menos as matrizes para permitir seleção
    if(!unidadeId){
      const campos = 'codigo nome is_principal unidade_principal_id';
      const matrizes = await Unidade.find({ is_principal: true }).select(campos).lean();
      matrizes.sort((a,b)=>{
        const ca = (a.codigo||'').localeCompare(b.codigo||'');
        if(ca!==0) return ca; return (a.nome||'').localeCompare(b.nome||'');
      });
      const data = matrizes.map(u=>({ id:u._id, codigo:u.codigo||null, nome:u.nome, is_principal:true }));
      return res.json({ data, fallback: 'no-unidade-matrizes' });
    }
    const unidadeUser = await Unidade.findById(unidadeId).lean();
    if(!unidadeUser) return res.json({ data: [] });

    // Determinar id da matriz (principal) do cluster
    let matrizId = null;
    if(unidadeUser.is_principal){
      matrizId = unidadeUser._id;
    } else if(unidadeUser.unidade_principal_id){
      matrizId = unidadeUser.unidade_principal_id;
    } else {
      // fallback: considerar própria unidade como cluster singular
      matrizId = unidadeUser._id;
    }

    const filtro = { $or: [ { _id: matrizId }, { unidade_principal_id: matrizId } ] };
    const campos = 'codigo nome is_principal unidade_principal_id';
    const todas = await Unidade.find(filtro).select(campos).lean();

    // Ordenar: matriz primeiro, depois filiais por código ou nome
    const matriz = todas.find(u => String(u._id) === String(matrizId));
    const filiais = todas.filter(u => String(u._id) !== String(matrizId));
    filiais.sort((a,b)=>{
      const ca = (a.codigo||'').localeCompare(b.codigo||'');
      if(ca!==0) return ca; return (a.nome||'').localeCompare(b.nome||'');
    });
    const ordered = [ matriz, ...filiais ].filter(Boolean);
    const data = ordered.map(u=>({
      id: u._id,
      codigo: u.codigo || null,
      nome: u.nome,
      is_principal: !!u.is_principal
    }));
    return res.json({ data });
  } catch(e){
    console.error('[escalas][api/unidades-relacionadas] erro:', e);
    return res.status(500).json({ error: 'Falha ao listar unidades' });
  }
});

export default router;
