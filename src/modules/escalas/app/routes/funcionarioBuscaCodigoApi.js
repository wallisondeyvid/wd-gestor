import { Router } from 'express';
import mongoose from 'mongoose';

async function getFuncionarioModel(){
  const mod = await import('#models/Funcionario.js');
  return mod.default || mod.Funcionario || mod;
}
async function getUnidadeModel(){
  const mod = await import('#models/unidade.js');
  return mod.default || mod.Unidade || mod;
}

const router = Router();

function requireEscalasAuth(req,res,next){
  if(!req.session?.escalasUser) return res.status(401).json({ error: 'Não autenticado' });
  next();
}

function resolveUsuarioBase(req){
  const usuario = req.user || req.session.escalasUser || {};
  const isMaster = !!usuario.isMaster || usuario.role === 'master' || usuario.role === 'admin';
  return { usuario, isMaster };
}

async function resolveClusterPermitidoIds({ usuario, isMaster, Unidade }){
  if(isMaster){
    return null;
  }

  const unidadeId = usuario.unidade_id || null;
  if(!unidadeId || !mongoose.isValidObjectId(unidadeId)){
    return null;
  }

  const uniUser = await Unidade.findById(unidadeId).lean();
  if(!uniUser){
    return null;
  }

  let matrizId;
  if(uniUser.is_principal){ matrizId = uniUser._id; }
  else if(uniUser.unidade_principal_id){ matrizId = uniUser.unidade_principal_id; }
  else { matrizId = uniUser._id; }

  const relacionadas = await Unidade.find({
    $or: [
      { _id: matrizId },
      { unidade_principal_id: matrizId }
    ]
  }).select('_id').lean();

  return relacionadas.map((relacionada) => relacionada._id.toString());
}

async function findFuncionarioByCodigoOuId({ id, codigo, Funcionario }){
  let doc = null;

  if(id && mongoose.isValidObjectId(id)){
    doc = await Funcionario.findOne({ _id:id, ativo:true }).select('nome cpf codigo unidade_id').lean();
  }

  if(!doc && codigo){
    const codRaw = String(codigo).trim();
    const codNorm = codRaw.replace(/^\s+|\s+$/g, '');
    const codEsc = codNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = { ativo:true, codigo: { $regex: '^\\s*' + codEsc + '\\s*$', $options:'i' } };

    doc = await Funcionario.findOne(match).select('nome cpf codigo unidade_id').lean();

    if(!doc && /^\d{11}$/.test(codNorm)){
      doc = await Funcionario.findOne({ ativo:true, cpf: codNorm }).select('nome cpf codigo unidade_id').lean();
    }

    if(!doc && mongoose.isValidObjectId(codNorm)){
      doc = await Funcionario.findOne({ _id: codNorm, ativo:true }).select('nome cpf codigo unidade_id').lean();
    }
  }

  return doc;
}

// GET /api/funcionarios/busca-codigo?codigo=XYZ
// Regras:
// - Apenas funcionários do cluster (matriz + filiais) da unidade do usuário autenticado, salvo se master.
// - Código pode ser numérico ou alfanumérico; busca exata case-insensitive.
// - Retorna 404 se não encontrado ou fora do cluster permitido.
router.get('/api/funcionarios/busca-codigo', requireEscalasAuth, async (req,res)=>{
  try {
    const { codigo, id } = req.query;
    if(!codigo && !id){
      return res.status(400).json({ error: 'Parâmetro codigo ou id obrigatório' });
    }

    const { usuario, isMaster } = resolveUsuarioBase(req);
    const Funcionario = await getFuncionarioModel();
    const Unidade = await getUnidadeModel();

    const clusterPermitidoIds = await resolveClusterPermitidoIds({ usuario, isMaster, Unidade });
    if(!isMaster && !clusterPermitidoIds){
      return res.status(404).json({ error: 'Funcionário não encontrado' });
    }

    const doc = await findFuncionarioByCodigoOuId({ id, codigo, Funcionario });
    if(!doc){
      return res.status(404).json({ error: 'Funcionário não encontrado' });
    }
    if(clusterPermitidoIds && !clusterPermitidoIds.includes(doc.unidade_id?.toString())){
      return res.status(404).json({ error: 'Funcionário não encontrado' });
    }
    let unidadeInfo = null;
    if(doc.unidade_id){
      const u = await Unidade.findById(doc.unidade_id).select('nome codigo').lean();
      if(u) unidadeInfo = { id: u._id, nome: u.nome, codigo: u.codigo || null };
    }
    return res.json({ data: {
      id: doc._id,
      nome: doc.nome,
      cpf: doc.cpf,
      codigo: doc.codigo || null,
      unidade_id: doc.unidade_id || null,
      unidade_nome: unidadeInfo?.nome || null,
      unidade_codigo: unidadeInfo?.codigo || null
    }});
  } catch(e){
    console.error('[escalas][GET /api/funcionarios/busca-codigo] erro:', e);
    return res.status(500).json({ error: 'Falha ao buscar funcionário' });
  }
});

export default router;
