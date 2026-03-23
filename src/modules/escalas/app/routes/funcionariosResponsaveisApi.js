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

function getRequestUser(req){
  return req.user || req.session.escalasUser || {};
}

function isPrivilegedUser(usuario){
  return !!usuario.isMaster || usuario.role === 'master' || usuario.role === 'admin';
}

function resolveMatrizId(unidade){
  if(unidade.is_principal) return unidade._id;
  if(unidade.unidade_principal_id) return unidade.unidade_principal_id;
  return unidade._id;
}

async function resolveClusterIdsByUnitId(Unidade, unidadeId){
  const unidade = await Unidade.findById(unidadeId).lean();
  if(!unidade) return null;

  const matrizId = resolveMatrizId(unidade);
  const relacionadas = await Unidade.find({
    $or:[
      { _id: matrizId },
      { unidade_principal_id: matrizId }
    ]
  }).select('_id').lean();

  return relacionadas.map((relacionada) => relacionada._id.toString());
}

function mapObservableFuncionario(doc, unidadesMap){
  return {
    id: doc._id,
    nome: doc.nome,
    cpf: doc.cpf,
    codigo: doc.codigo || null,
    unidade_id: doc.unidade_id,
    unidade_nome: (doc.unidade_id && unidadesMap[doc.unidade_id.toString()]?.nome) || null,
    unidade_codigo: (doc.unidade_id && unidadesMap[doc.unidade_id.toString()]?.codigo) || null
  };
}

// GET /api/funcionarios-responsaveis?unidade=&cpf=&codigo=&nome=
// Regras:
// - Filtra apenas unidades relacionadas ao usuário (mesma lógica de unidades-relacionadas) salvo se master.
// - cpf: dígitos (match exato)
// - nome: regex case-insensitive contendo termo
router.get('/api/funcionarios-responsaveis', requireEscalasAuth, async (req,res)=>{
  try {
    const usuario = getRequestUser(req);
    const isMaster = isPrivilegedUser(usuario);
    const { unidade, cpf, codigo, nome, incluirFiliais } = req.query;
    const Funcionario = await getFuncionarioModel();
    const Unidade = await getUnidadeModel();

    let unidadesPermitidasIds = [];
    if(isMaster){
      // master: sem restrição
    } else {
      const unidadeId = usuario.unidade_id || null;
      if(!unidadeId){
        return res.json({ data: [] });
      }
      const clusterIds = await resolveClusterIdsByUnitId(Unidade, unidadeId);
      if(!clusterIds){
        return res.json({ data: [] });
      }
      unidadesPermitidasIds = clusterIds;
    }

    const filtro = { ativo: true };
    if(unidade){
      if(!mongoose.isValidObjectId(unidade)) return res.json({ data: [] });
      if(!isMaster && !unidadesPermitidasIds.includes(unidade)) return res.json({ data: [] });

      if(incluirFiliais==='1' || incluirFiliais==='true'){
        // Buscar cluster da unidade passada (se for matriz pega filiais; se for filial pega matriz + irmãs)
        try {
          const clusterIds = await resolveClusterIdsByUnitId(Unidade, unidade);
          if(clusterIds){
            filtro.unidade_id = { $in: clusterIds };
          } else {
            filtro.unidade_id = unidade;
          }
        } catch(_e){ filtro.unidade_id = unidade; }
      } else {
        filtro.unidade_id = unidade;
      }
    } else if(!isMaster){
      // limitar ao cluster permitido
      filtro.unidade_id = { $in: unidadesPermitidasIds };
    }
    // CPF: aceitar completo (11) para match exato ou parcial >=4 dígitos para prefixo.
    if(cpf){
      const cpfDigits = String(cpf).replace(/\D/g,'');
      if(cpfDigits.length === 11) {
        filtro.cpf = cpfDigits;
      } else if(cpfDigits.length >=4) {
        filtro.cpf = { $regex: '^' + cpfDigits }; // prefixo
      } else {
        return res.json({ data: [] });
      }
    }
    if(codigo){
      let codTerm = String(codigo).trim();
      if(codTerm.length){
        const codDigits = codTerm.replace(/\D/g,'');
        // Heurística: só tratar como CPF se:
        // - usuário não mandou cpf param E
        // - possui máscara (pontos ou traço) OU exatamente 11 dígitos.
        const looksLikeCPF = (!cpf) && (/[.-]/.test(codTerm) || codDigits.length === 11);
        if(looksLikeCPF){
          if(codDigits.length === 11){
            filtro.cpf = codDigits;
          } else if(codDigits.length >= 4){
            filtro.cpf = { $regex: '^' + codDigits }; // prefixo de CPF
          } else {
            return res.json({ data: [] });
          }
        } else {
          // Busca por código: permitir prefixo para facilitar (até 5 chars) e exato para códigos maiores.
          const safe = codTerm.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
          if(/^[0-9]+$/.test(codTerm)){
            // Usuário digitou só números. Tentar casar códigos no formato FUNC00042 ou variantes.
            // Aceita:
            // - Exato número com zeros à esquerda
            // - Prefixo FUNC (ou variante FUNCIONARIO etc) seguido de zeros + número (permitir prefixo parcial)
            // Regex: ^(?:[A-Z]*?)?0*NUMERO$  (mas restringir a começar com FUNC se existir letras)
            // Para simplificar e evitar falsos positivos, usamos duas alternativas:
            // ^(?:FUNC[A-Z]*)?0*NUM$  OU  ^0*NUM$
            const rex = '^(?:FUNC[A-Z]*)?0*' + codTerm + '$|^0*' + codTerm + '$';
            filtro.codigo = { $regex: rex, $options: 'i' };
          } else if(codTerm.length < 6){
            // Prefixo curto textual: busca prefixo case-insensitive
            filtro.codigo = { $regex: '^' + safe, $options: 'i' };
          } else {
            // Para termos maiores, permitir tanto match exato quanto iniciar pelo termo se usuário não digitou sufixo numérico completo
            filtro.codigo = { $regex: '^' + safe, $options: 'i' };
          }
        }
      }
    }
    if(process.env.NODE_ENV !== 'production'){
      console.log('[DEBUG funcionarios-responsaveis] filtro gerado:', JSON.stringify(filtro));
    }
    if(nome){
      const nomeTerm = String(nome).trim();
      if(nomeTerm.length){ filtro.nome = { $regex: nomeTerm.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), $options: 'i' }; }
    }

    const docs = await Funcionario.find(filtro).select('nome cpf codigo unidade_id').limit(200).lean();
    // map unidades para nomes
    const unidadeIds = [...new Set(docs.map(d=> d.unidade_id).filter(Boolean))];
    let unidadesMap = {};
    if(unidadeIds.length){
      const unis = await Unidade.find({ _id: { $in: unidadeIds } }).select('nome codigo').lean();
      unis.forEach(u=>{ unidadesMap[u._id.toString()] = { nome: u.nome, codigo: u.codigo||null }; });
    }
    const data = docs.map((doc) => mapObservableFuncionario(doc, unidadesMap));
    return res.json({ data });
  } catch(e){
    console.error('[escalas][GET /api/funcionarios-responsaveis] erro:', e);
    return res.status(500).json({ error: 'Falha ao pesquisar funcionários' });
  }
});

// GET /api/funcionarios/por-ids?ids=<id1,id2,...>
// Retorna { id, nome, codigo, cpf, unidade_id, unidade_nome, unidade_codigo } para os IDs informados.
router.get('/api/funcionarios/por-ids', requireEscalasAuth, async (req,res)=>{
  try {
    const idsRaw = String(req.query?.ids||'').trim();
    if(!idsRaw) return res.json({ data: [] });
    const ids = idsRaw.split(',').map(s=> s.trim()).filter(Boolean);
    if(!ids.length) return res.json({ data: [] });
    const mongoose = (await import('mongoose')).default || (await import('mongoose'));
    const isHex24 = (v)=> typeof v==='string' && /^[0-9a-fA-F]{24}$/.test(v);
    const oids = ids.filter(isHex24).map(x=> new mongoose.Types.ObjectId(x));
    if(!oids.length) return res.json({ data: [] });
    const Funcionario = await getFuncionarioModel();
    const Unidade = await getUnidadeModel();
    const docs = await Funcionario.find({ _id: { $in: oids } }).select('nome cpf codigo unidade_id').lean();
    const unidadeIds = [...new Set(docs.map(d=> d.unidade_id).filter(Boolean))];
    let unidadesMap = {};
    if(unidadeIds.length){
      const unis = await Unidade.find({ _id: { $in: unidadeIds } }).select('nome codigo').lean();
      unis.forEach(u=>{ unidadesMap[u._id.toString()] = { nome: u.nome, codigo: u.codigo||null }; });
    }
    const data = docs.map(d=> ({
      id: d._id.toString(),
      nome: d.nome||null,
      cpf: d.cpf||null,
      codigo: d.codigo||null,
      unidade_id: d.unidade_id || null,
      unidade_nome: (d.unidade_id && unidadesMap[d.unidade_id.toString()]?.nome) || null,
      unidade_codigo: (d.unidade_id && unidadesMap[d.unidade_id.toString()]?.codigo) || null
    }));
    return res.json({ data });
  } catch(e){
    console.error('[escalas][GET /api/funcionarios/por-ids] erro:', e);
    return res.status(500).json({ error: 'Falha ao resolver funcionários' });
  }
});

export default router;