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

const FUNCIONARIO_BUSCA_SELECT = 'nome cpf codigo unidade_id';
const UNIDADE_BUSCA_SELECT = 'nome codigo';

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

function normalizeBuscaCodigoInput(query = {}){
  const codigoRaw = query.codigo;
  const idRaw = query.id;
  const codigo = codigoRaw == null ? '' : String(codigoRaw);
  const id = idRaw == null ? '' : String(idRaw);

  return {
    codigo,
    id,
    hasLookupInput: Boolean(codigo || id),
  };
}

function normalizeCodigoBusca(codigo){
  const normalized = String(codigo || '').trim();
  return {
    raw: normalized,
    escaped: normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  };
}

async function findFuncionarioByCodigoOuId({ id, codigo, Funcionario }){
  let doc = null;

  if(id && mongoose.isValidObjectId(id)){
    doc = await Funcionario.findOne({ _id:id, ativo:true }).select(FUNCIONARIO_BUSCA_SELECT).lean();
  }

  if(!doc && codigo){
    const codNorm = normalizeCodigoBusca(codigo);
    const match = { ativo:true, codigo: { $regex: '^\\s*' + codNorm.escaped + '\\s*$', $options:'i' } };

    doc = await Funcionario.findOne(match).select(FUNCIONARIO_BUSCA_SELECT).lean();

    if(!doc && /^\d{11}$/.test(codNorm.raw)){
      doc = await Funcionario.findOne({ ativo:true, cpf: codNorm.raw }).select(FUNCIONARIO_BUSCA_SELECT).lean();
    }

    if(!doc && mongoose.isValidObjectId(codNorm.raw)){
      doc = await Funcionario.findOne({ _id: codNorm.raw, ativo:true }).select(FUNCIONARIO_BUSCA_SELECT).lean();
    }
  }

  return doc;
}

function funcionarioEstaNoClusterPermitido(doc, clusterPermitidoIds){
  if(!clusterPermitidoIds){
    return true;
  }

  return clusterPermitidoIds.includes(doc.unidade_id?.toString());
}

async function loadFuncionarioBuscaUnidadeInfo(Unidade, unidadeId){
  if(!unidadeId){
    return null;
  }

  const unidade = await Unidade.findById(unidadeId).select(UNIDADE_BUSCA_SELECT).lean();
  if(!unidade){
    return null;
  }

  return {
    id: unidade._id,
    nome: unidade.nome,
    codigo: unidade.codigo || null,
  };
}

function serializeFuncionarioBuscaPayload(doc, unidadeInfo){
  return {
    id: doc._id,
    nome: doc.nome,
    cpf: doc.cpf,
    codigo: doc.codigo || null,
    unidade_id: doc.unidade_id || null,
    unidade_nome: unidadeInfo?.nome || null,
    unidade_codigo: unidadeInfo?.codigo || null
  };
}

async function resolveFuncionarioBuscaPayload(req){
  const input = normalizeBuscaCodigoInput(req.query);
  if(!input.hasLookupInput){
    return { status: 400, body: { error: 'Parâmetro codigo ou id obrigatório' } };
  }

  const { usuario, isMaster } = resolveUsuarioBase(req);
  const Funcionario = await getFuncionarioModel();
  const Unidade = await getUnidadeModel();

  const clusterPermitidoIds = await resolveClusterPermitidoIds({ usuario, isMaster, Unidade });
  if(!isMaster && !clusterPermitidoIds){
    return { status: 404, body: { error: 'Funcionário não encontrado' } };
  }

  const doc = await findFuncionarioByCodigoOuId({
    id: input.id,
    codigo: input.codigo,
    Funcionario,
  });
  if(!doc){
    return { status: 404, body: { error: 'Funcionário não encontrado' } };
  }

  if(!funcionarioEstaNoClusterPermitido(doc, clusterPermitidoIds)){
    return { status: 404, body: { error: 'Funcionário não encontrado' } };
  }

  const unidadeInfo = await loadFuncionarioBuscaUnidadeInfo(Unidade, doc.unidade_id);
  return { status: 200, body: { data: serializeFuncionarioBuscaPayload(doc, unidadeInfo) } };
}

// GET /api/funcionarios/busca-codigo?codigo=XYZ
// Regras:
// - Apenas funcionários do cluster (matriz + filiais) da unidade do usuário autenticado, salvo se master.
// - Código pode ser numérico ou alfanumérico; busca exata case-insensitive.
// - Retorna 404 se não encontrado ou fora do cluster permitido.
router.get('/api/funcionarios/busca-codigo', requireEscalasAuth, async (req,res)=>{
  try {
    const result = await resolveFuncionarioBuscaPayload(req);
    return res.status(result.status).json(result.body);
  } catch(e){
    console.error('[escalas][GET /api/funcionarios/busca-codigo] erro:', e);
    return res.status(500).json({ error: 'Falha ao buscar funcionário' });
  }
});

export default router;
