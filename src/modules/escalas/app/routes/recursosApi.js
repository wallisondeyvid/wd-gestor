import express from 'express';
import Recurso from '#models/recurso.js';
import Unidade from '#models/unidade.js';

// API interna de escalas para busca de recursos sem depender do middleware do módulo Gestor
// GET /escalas/api/recursos?placa=XXX&unidadeId=YYY
// Requer sessão escalasUser ativa
const router = express.Router();
console.log('[Escalas][recursosApi] router carregado');

function resolveUsuarioBaseEscalas(req) {
  const usuario = req.session?.escalasUser || {};
  const role = usuario.role || usuario.perfil || 'user';
  const isPrivileged = role === 'master' || role === 'admin';

  return {
    usuario,
    role,
    isPrivileged,
  };
}

async function recursoEstaNoEscopoDoUsuario({ usuario, Unidade, recursoUnidadeId }) {
  let principalId = usuario.unidade_principal_id || usuario.unidadePrincipalId || null;

  if (!principalId && usuario.unidade_id) {
    const unidadeUsuario = await Unidade.findById(usuario.unidade_id)
      .select('_id is_principal unidade_principal_id matriz_id')
      .lean();

    if (unidadeUsuario) {
      principalId = unidadeUsuario.is_principal
        ? unidadeUsuario._id
        : (unidadeUsuario.unidade_principal_id || unidadeUsuario.matriz_id || unidadeUsuario._id);
    }
  }

  if (principalId) {
    const relacao = await Unidade.findOne({
      _id: recursoUnidadeId,
      $or: [
        { _id: principalId },
        { unidade_principal_id: principalId },
        { matriz_id: principalId },
      ],
    }).select('_id').lean();

    return !!relacao;
  }

  if (usuario.unidade_id) {
    return String(recursoUnidadeId) === String(usuario.unidade_id);
  }

  return true;
}

function serializeRecursoDetalhe(rec) {
  return {
    id: rec._id,
    placa: rec.placa || rec.codigo || '',
    marca: rec.marca || rec.fabricante || '',
    modelo: rec.modelo || rec.model || '',
    nome: rec.nome || rec.descricao || '',
    unidade: rec.unidade_id ? ((rec.unidade_id.codigo ? rec.unidade_id.codigo + ' - ' : '') + (rec.unidade_id.nome || '')) : ''
  };
}

async function findRecursoDetalheById(id) {
  return Recurso.findById(id)
    .populate({ path:'unidade_id', select:'codigo nome _id is_principal unidade_principal_id matriz_id' })
    .lean();
}

async function assertRecursoDentroDoEscopo(req, rec) {
  const { usuario, isPrivileged } = resolveUsuarioBaseEscalas(req);
  if(isPrivileged) {
    return true;
  }

  const uid = rec.unidade_id?._id || rec.unidade_id;
  return recursoEstaNoEscopoDoUsuario({
    usuario,
    Unidade,
    recursoUnidadeId: uid,
  });
}

async function resolveRecursoDetalhePayload(req, id) {
  const rec = await findRecursoDetalheById(id);
  if(!rec) {
    return { status: 404, body: { error:'nao_encontrado' } };
  }

  const recursoNoEscopo = await assertRecursoDentroDoEscopo(req, rec);
  if(!recursoNoEscopo) {
    return { status: 403, body: { error:'fora_do_escopo' } };
  }

  return { status: 200, body: serializeRecursoDetalhe(rec) };
}

router.get('/api/recursos', async (req,res)=>{
  console.log('[Escalas][recursosApi] HIT /api/recursos query=', req.query, 'sessionUser?', !!req.session?.escalasUser);
  try {
    if(!req.session?.escalasUser){
      return res.status(401).json({ error:'Não autenticado' });
    }
    let { placa, unidadeId } = req.query;
    placa = (placa||'').trim();
    unidadeId = (unidadeId||'').trim();
    const filtro = {};
    let placaTermNorm = null;
    if(placa && placa.length>=2){
      placaTermNorm = placa.replace(/[^A-Za-z0-9]/g,'').toUpperCase();
    }
    if(unidadeId){ filtro.unidade_id = unidadeId; }

    // Escopo hierárquico simples baseado na unidade do escalasUser (se não master)
    const su = req.session.escalasUser || {};
    const role = su.role || su.perfil || 'user';
    if(role!=='master' && role!=='admin'){
      let principalId = su.unidade_principal_id || su.unidadePrincipalId || null;
      if(!principalId && su.unidade_id){
        const u = await Unidade.findById(su.unidade_id).select('_id is_principal unidade_principal_id matriz_id').lean();
        if(u) principalId = u.is_principal? u._id : (u.unidade_principal_id || u.matriz_id || u._id);
      }
      const cond = principalId ? { $or:[{ _id:principalId }, { unidade_principal_id:principalId }, { matriz_id:principalId }] } : { _id: su.unidade_id || null };
      const unidadesAcessiveis = await Unidade.find(cond).select('_id').lean();
      const ids = unidadesAcessiveis.map(u=>String(u._id));
      if(unidadeId && !ids.includes(String(unidadeId))){ return res.json([]); }
      if(!unidadeId){ filtro.unidade_id = { $in: ids }; }
    }

    let recursos = await Recurso.find(filtro)
      .populate({ path:'unidade_id', select:'codigo nome' })
      .sort({ placa:1 })
      .limit(100)
      .lean();
    // Aplicar filtragem hífen/caso/extra insensível em memória se termo informado
    if(placaTermNorm){
      recursos = recursos.filter(r=>{
        const normR = (r.placa||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase();
        return normR.includes(placaTermNorm);
      });
    }
    const mapped = recursos.map(r=>({
      id: r._id,
      placa: r.placa,
      descricao: [r.marca, r.modelo].filter(Boolean).join(' ') || r.modelo || r.marca || '',
      unidadeFormatada: r.unidade_id ? ((r.unidade_id.codigo? r.unidade_id.codigo+' - ':'') + (r.unidade_id.nome||'')) : ''
    }));
    return res.json(mapped);
  } catch(err){
    console.error('[Escalas][api/recursos] erro:', err);
    return res.status(500).json({ error:'erro_interno' });
  }
});

// GET /escalas/api/recursos/:id — detalhes de um recurso por ID usando a sessão do módulo Escalas
router.get('/api/recursos/:id', async (req,res)=>{
  try {
    if(!req.session?.escalasUser){
      return res.status(401).json({ error:'nao_autenticado' });
    }
    const id = (req.params.id||'').trim();
    if(!id){ return res.status(400).json({ error:'id_invalido' }); }
    const result = await resolveRecursoDetalhePayload(req, id);
    return res.status(result.status).json(result.body);
  } catch(err){
    console.error('[Escalas][api/recursos/:id] erro:', err);
    return res.status(500).json({ error:'erro_interno' });
  }
});

// DELETE /escalas/api/recursos/:id — remoção simples respeitando escopo de unidades
router.delete('/api/recursos/:id', async (req,res)=>{
  try {
    if(!req.session?.escalasUser){ return res.status(401).json({ error:'nao_autenticado' }); }
    const su = req.session.escalasUser || {};
    const role = su.role || su.perfil || 'user';
    const id = req.params.id;
    if(!id) return res.status(400).json({ error:'id_invalido' });
    const rec = await Recurso.findById(id).populate('unidade_id','_id is_principal unidade_principal_id matriz_id');
    if(!rec) return res.status(404).json({ error:'nao_encontrado' });
    if(role!=='master' && role!=='admin'){
      let principalId = su.unidade_principal_id || su.unidadePrincipalId || null;
      if(!principalId && su.unidade_id){
        const u = await Unidade.findById(su.unidade_id).select('_id is_principal unidade_principal_id matriz_id').lean();
        if(u) principalId = u.is_principal? u._id : (u.unidade_principal_id || u.matriz_id || u._id);
      }
      // Recurso está dentro do cluster do usuário?
      const uid = rec.unidade_id?._id || rec.unidade_id;
      if(principalId){
        // Verificar se unidade do recurso pertence ao cluster (própria, filial ou matriz do cluster)
        const rel = await Unidade.findOne({ _id: uid, $or:[{ _id:principalId }, { unidade_principal_id:principalId }, { matriz_id:principalId }] }).select('_id').lean();
        if(!rel) return res.status(403).json({ error:'fora_do_escopo' });
      } else if (su.unidade_id && String(uid)!==String(su.unidade_id)){
        return res.status(403).json({ error:'fora_do_escopo' });
      }
    }
    await rec.deleteOne();
    return res.json({ ok:true, deleted:true, id });
  } catch(err){
    console.error('[Escalas][api/recursos][delete] erro:', err);
    return res.status(500).json({ error:'erro_interno' });
  }
});

export default router;
