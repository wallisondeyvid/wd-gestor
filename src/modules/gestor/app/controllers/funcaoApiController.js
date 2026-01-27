// funcaoApiController.js - API de Funções (migrado)
import mongoose from 'mongoose';
import Funcao from '#models/funcao.js';
import Unidade from '#models/unidade.js';
import { ok, created, badRequest, notFound, serverError } from '#core/utils/apiResponse.js';

function normalizarListaModulos(input){
  if (input === undefined || input === null) return [];
  if (Array.isArray(input)) return input.filter(Boolean);
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) { try { return JSON.parse(trimmed); } catch { return [trimmed]; } }
    if (trimmed.includes(',')) return trimmed.split(',').map(s=>s.trim()).filter(Boolean);
    return [trimmed];
  }
  return [];
}

export async function createFuncao(req,res){
  try {
    const { nome, descricao, unidade_principal_id, modulos_habilitados } = req.body;
    if (!nome) return badRequest(res,'Nome é obrigatório');
    if (!unidade_principal_id) return badRequest(res,'Unidade principal é obrigatória');
    const dup = await Funcao.findOne({ nome }); if (dup) return badRequest(res,'Função já cadastrada');
    const unidade = await Unidade.findById(unidade_principal_id).populate('modulosAcessiveis');
    if (!unidade) return badRequest(res,'Unidade inválida');
    const lista = normalizarListaModulos(modulos_habilitados);
    const permitidos = new Set((unidade.modulosAcessiveis||[]).map(m=>String(m._id)));
    const modsFiltrados = lista.filter(id=>permitidos.has(String(id)));
    const funcao = await Funcao.create({ nome, descricao, unidade_principal_id, modulos_habilitados: modsFiltrados });
    return created(res, funcao._id, { data:{ _id: funcao._id } });
  } catch(e){ console.error('[API FUNCOES][create] Erro:', e); return serverError(res,e); }
}

export async function getFuncao(req,res){
  try {
    const funcao = await Funcao.findById(req.params.id).populate('unidade_principal_id modulos_habilitados');
    if (!funcao) return notFound(res,'Função não encontrada');
    return ok(res,{ _id:funcao._id, nome:funcao.nome, descricao:funcao.descricao||'', unidade_principal_id: funcao.unidade_principal_id?funcao.unidade_principal_id._id:null, modulos_habilitados:(funcao.modulos_habilitados||[]).map(m=>({_id:m._id,nome:m.nome})) });
  } catch(e){ console.error('[API FUNCOES][get] Erro:', e); return serverError(res,e); }
}

export async function updateFuncao(req,res){
  try {
    const { id } = req.params;
    const { nome, descricao, unidade_principal_id, modulos_habilitados } = req.body;
    const existente = await Funcao.findById(id);
    if (!existente) return notFound(res,'Função não encontrada');
    if (nome && nome !== existente.nome) {
      const dup = await Funcao.findOne({ nome, _id:{ $ne:id } });
      if (dup) return badRequest(res,'Já existe uma função com este nome');
    }
    const updates = {};
    if (nome) updates.nome = nome;
    if (descricao !== undefined) updates.descricao = descricao;
    if (unidade_principal_id){
      const unidade = await Unidade.findById(unidade_principal_id).populate('modulosAcessiveis');
      if (!unidade) return badRequest(res,'Unidade inválida');
      updates.unidade_principal_id = unidade_principal_id;
      if (modulos_habilitados !== undefined){
        const lista = normalizarListaModulos(modulos_habilitados);
        const permitidos = new Set((unidade.modulosAcessiveis||[]).map(m=>String(m._id)));
        updates.modulos_habilitados = lista.filter(id=>permitidos.has(String(id)));
      }
    } else if (modulos_habilitados !== undefined){
      const unidade = await Unidade.findById(existente.unidade_principal_id).populate('modulosAcessiveis');
      const lista = normalizarListaModulos(modulos_habilitados);
      const permitidos = new Set((unidade.modulosAcessiveis||[]).map(m=>String(m._id)));
      updates.modulos_habilitados = lista.filter(id=>permitidos.has(String(id)));
    }
    await Funcao.findByIdAndUpdate(id, updates, { runValidators:true });
    const updated = await Funcao.findById(id).lean();
    const nomeF = updated?.nome || '';
    const rawDesc = (updated?.descricao && updated.descricao.trim()) ? updated.descricao.trim() : '';
    const codigo = updated?.codigo || '';
    const descricaoDisplay = rawDesc || (nomeF && nomeF !== codigo ? nomeF : '');
    return ok(res,{ updated:true, funcao:{ _id:updated._id, codigo, nome:nomeF, descricao: rawDesc, descricao_display: descricaoDisplay, hasDescricaoReal: !!rawDesc } });
  } catch(e){ console.error('[API FUNCOES][update] Erro:', e); return serverError(res,e); }
}

export async function getFuncoesPorUnidade(req,res){
  try {
    const { unidadeId } = req.params;
    if (!unidadeId || unidadeId==='null') return ok(res,[]);
    const funcoes = await Funcao.find({ unidade_principal_id: unidadeId }).lean();
    return ok(res, funcoes.map(f=>{
      const nome = f.nome || '';
      const rawDesc = (f.descricao && f.descricao.trim()) ? f.descricao.trim() : '';
      const codigo = f.codigo || '';
      // Novo fallback: se não há descricao real e nome==codigo, usa o próprio código como descricao_display
      const descricaoDisplay = rawDesc || (nome && nome !== codigo ? nome : codigo);
      const descricao_final = rawDesc || nome || codigo;
      return { _id:f._id, nome, codigo, descricao: rawDesc, descricao_display: descricaoDisplay, descricao_final, hasDescricaoReal: !!rawDesc };
    }));
  } catch(e){ console.error('[API FUNCOES][getPorUnidade] Erro:', e); return serverError(res,e); }
}

export async function listarFuncoesApi(req,res){
  try {
    const { unidade_cluster, q, unidade_id } = req.query;
    if (unidade_cluster){
      const clusterRes = await Unidade.find({ $or:[ { _id:unidade_cluster }, { unidade_principal_id:unidade_cluster }, { matriz_id:unidade_cluster } ] }).select('_id').lean();
      let unidadeIds = clusterRes.map(u=>u._id);
      if (!unidadeIds.some(id=>String(id)===String(unidade_cluster))) unidadeIds.push(unidade_cluster);
      const filtro = { unidade_principal_id:{ $in:unidadeIds.map(id=> new mongoose.Types.ObjectId(String(id))) } };
      let funcoes = await Funcao.find(filtro).lean();
      if (q && q.trim()){
        const searchTerm = q.trim().toLowerCase();
        funcoes = funcoes.filter(f => (f.nome&&f.nome.toLowerCase().includes(searchTerm)) || (f.codigo&&f.codigo.toLowerCase().includes(searchTerm)) || (f.descricao&&f.descricao.toLowerCase().includes(searchTerm)) );
      }
      funcoes.sort((a,b)=>(a.nome||'').localeCompare(b.nome||''));
      return ok(res, funcoes.map(f=>({ _id:f._id, nome:f.nome, descricao:f.descricao||'', codigo:f.codigo||'' })) );
    }
    if (unidade_id){
      const ids = String(unidade_id).split(',').map(s=>s.trim()).filter(Boolean);
      const filtro = ids.length===1 ? { unidade_principal_id: ids[0] } : { unidade_principal_id:{ $in: ids } };
      const funcoes = await Funcao.find(filtro).select('codigo nome descricao').lean();
      return ok(res, funcoes.map(f=>{
        const nome = f.nome || '';
        const rawDesc = (f.descricao && f.descricao.trim()) ? f.descricao.trim() : '';
        const codigo = f.codigo || '';
        const descricaoDisplay = rawDesc || (nome && nome !== codigo ? nome : codigo);
        const descricao_final = rawDesc || nome || codigo;
        return { _id:f._id, codigo, nome, descricao: rawDesc, descricao_display: descricaoDisplay, descricao_final, hasDescricaoReal: !!rawDesc };
      }));
    }
    return ok(res,[]);
  } catch(e){ console.error('[API FUNCOES][listar] Erro:', e); return serverError(res,e); }
}

export async function deleteFuncao(req,res){
  try {
    const funcao = await Funcao.findById(req.params.id);
    if (!funcao) return notFound(res,'Função não encontrada');
    await Funcao.findByIdAndDelete(req.params.id);
    return ok(res,{ deleted:true, id:req.params.id });
  } catch(e){ console.error('[API FUNCOES][delete] Erro:', e); return serverError(res,e); }
}

// Bulk update: recebe array de objetos { _id, nome?, descricao? }
export async function bulkUpdateFuncoes(req,res){
  try {
    const itens = Array.isArray(req.body?.itens)?req.body.itens:[];
    if(!itens.length) return badRequest(res,'Lista vazia');
    const resultados=[]; let atualizados=0;
    for(const it of itens){
      const id = it._id || it.id; if(!id) { resultados.push({ ok:false, motivo:'Sem _id' }); continue; }
      const f = await Funcao.findById(id); if(!f){ resultados.push({ _id:id, ok:false, motivo:'Nao encontrada' }); continue; }
      let changed=false;
      if(it.nome && it.nome!==f.nome){ f.nome = it.nome; changed=true; }
      if(it.descricao!==undefined && it.descricao!==f.descricao){ f.descricao = it.descricao; changed=true; }
      if(changed){ await f.save(); atualizados++; }
      resultados.push({ _id:f._id, ok:true, changed });
    }
    return ok(res,{ updated:atualizados, results:resultados });
  } catch(e){ console.error('[API FUNCOES][bulkUpdate] Erro:', e); return serverError(res,e); }
}

export default { createFuncao, getFuncao, updateFuncao, getFuncoesPorUnidade, listarFuncoesApi, deleteFuncao, bulkUpdateFuncoes };
