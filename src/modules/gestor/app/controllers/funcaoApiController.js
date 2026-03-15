// funcaoApiController.js - API de Funções (migrado)
import mongoose from 'mongoose';
import { ok, created, badRequest, notFound, serverError } from '#core/utils/apiResponse.js';
import {
  findFuncaoByNome,
  createFuncao as createFuncaoDb,
  findFuncaoByIdPopulated,
  findFuncaoById,
  findOutraFuncaoByNomeExcludingId,
  updateFuncaoById,
  findFuncaoByIdLean,
  findFuncoesByPrincipalUnitIdLean,
  findFuncoesByFiltroLean,
  findFuncoesByFiltroSelectLean,
  deleteFuncaoById,
  saveFuncao,
  findUnidadeByIdWithModulosAcessiveis,
  findUnidadeUserBaseLean,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

function normalizeUnitId(value){
  return String(value || '').trim();
}

function isMasterOrAdmin(req) {
  return req.user?.isMaster || req.user?.role === 'admin';
}

function getScopedUnitId(req) {
  return normalizeUnitId(req.unitScope?.unidadeId);
}

function getLegacyUserUnitId(req) {
  return normalizeUnitId(req.user?.unidade_id);
}

function getLegacyUserPrincipalUnitId(req) {
  return normalizeUnitId(req.user?.unidade_principal_id);
}

async function resolvePrincipalUnitId(unidadeId) {
  const unidadeIdNorm = normalizeUnitId(unidadeId);
  if (!unidadeIdNorm) return '';

  const unidade = await findUnidadeUserBaseLean(unidadeIdNorm);
  if (!unidade) return unidadeIdNorm;

  return normalizeUnitId(
    unidade.is_principal
      ? unidade._id
      : unidade.unidade_principal_id || unidade.matriz_id || unidade._id || unidadeIdNorm,
  );
}

async function getCanonicalContextPrincipalUnitId(req) {
  const scopedUnitId = getScopedUnitId(req);
  if (scopedUnitId) return resolvePrincipalUnitId(scopedUnitId);

  if (!isMasterOrAdmin(req)) {
    const legacyPrincipalUnitId = getLegacyUserPrincipalUnitId(req);
    if (legacyPrincipalUnitId) return legacyPrincipalUnitId;

    const legacyUnitId = getLegacyUserUnitId(req);
    if (legacyUnitId) return resolvePrincipalUnitId(legacyUnitId);
  }

  return '';
}

async function requestedUnitWithinContextCluster(req, requestedUnitId) {
  const requestedUnitIdNorm = normalizeUnitId(requestedUnitId);
  if (!requestedUnitIdNorm) return true;

  const contextPrincipalUnitId = await getCanonicalContextPrincipalUnitId(req);
  if (!contextPrincipalUnitId) return true;

  const requestedPrincipalUnitId = await resolvePrincipalUnitId(requestedUnitIdNorm);
  return !!requestedPrincipalUnitId && requestedPrincipalUnitId === contextPrincipalUnitId;
}

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
    const contextPrincipalUnitId = await getCanonicalContextPrincipalUnitId(req);
    const canonicalPrincipalUnitId = contextPrincipalUnitId || normalizeUnitId(unidade_principal_id);
    if (!nome) return badRequest(res,'Nome é obrigatório');
    if (!canonicalPrincipalUnitId) return badRequest(res,'Unidade principal é obrigatória');
    if (!(await requestedUnitWithinContextCluster(req, unidade_principal_id || canonicalPrincipalUnitId))) return notFound(res,'Unidade principal não encontrada');
    const dup = await findFuncaoByNome(nome, canonicalPrincipalUnitId); if (dup) return badRequest(res,'Função já cadastrada');
    const unidade = await findUnidadeByIdWithModulosAcessiveis(canonicalPrincipalUnitId);
    if (!unidade) return badRequest(res,'Unidade inválida');
    const lista = normalizarListaModulos(modulos_habilitados);
    const permitidos = new Set((unidade.modulosAcessiveis||[]).map(m=>String(m._id)));
    const modsFiltrados = lista.filter(id=>permitidos.has(String(id)));
    const funcao = await createFuncaoDb({ nome, descricao, unidade_principal_id: canonicalPrincipalUnitId, modulos_habilitados: modsFiltrados });
    return created(res, funcao._id, { data:{ _id: funcao._id } });
  } catch(e){ console.error('[API FUNCOES][create] Erro:', e); return serverError(res,e); }
}

export async function getFuncao(req,res){
  try {
    const contextPrincipalUnitId = await getCanonicalContextPrincipalUnitId(req);
    const funcao = await findFuncaoByIdPopulated(req.params.id, contextPrincipalUnitId || null);
    if (!funcao) return notFound(res,'Função não encontrada');
    return ok(res,{ _id:funcao._id, nome:funcao.nome, descricao:funcao.descricao||'', unidade_principal_id: funcao.unidade_principal_id?funcao.unidade_principal_id._id:null, modulos_habilitados:(funcao.modulos_habilitados||[]).map(m=>({_id:m._id,nome:m.nome})) });
  } catch(e){ console.error('[API FUNCOES][get] Erro:', e); return serverError(res,e); }
}

export async function updateFuncao(req,res){
  try {
    const { id } = req.params;
    const { nome, descricao, unidade_principal_id, modulos_habilitados } = req.body;
    const contextPrincipalUnitId = await getCanonicalContextPrincipalUnitId(req);
    const existente = await findFuncaoById(id, contextPrincipalUnitId || null);
    if (!existente) return notFound(res,'Função não encontrada');
    const unidadePrincipalExistenteId = normalizeUnitId(existente.unidade_principal_id);
    const targetPrincipalUnitId = contextPrincipalUnitId || normalizeUnitId(unidade_principal_id || unidadePrincipalExistenteId);
    if (nome && nome !== existente.nome) {
      const dup = await findOutraFuncaoByNomeExcludingId(id, nome, targetPrincipalUnitId || unidadePrincipalExistenteId || null);
      if (dup) return badRequest(res,'Já existe uma função com este nome');
    }
    const updates = {};
    if (nome) updates.nome = nome;
    if (descricao !== undefined) updates.descricao = descricao;
    if (unidade_principal_id && !(await requestedUnitWithinContextCluster(req, unidade_principal_id))) {
      return notFound(res,'Unidade principal não encontrada');
    }
    if (targetPrincipalUnitId){
      const unidade = await findUnidadeByIdWithModulosAcessiveis(targetPrincipalUnitId);
      if (!unidade) return badRequest(res,'Unidade inválida');
      updates.unidade_principal_id = targetPrincipalUnitId;
      if (modulos_habilitados !== undefined){
        const lista = normalizarListaModulos(modulos_habilitados);
        const permitidos = new Set((unidade.modulosAcessiveis||[]).map(m=>String(m._id)));
        updates.modulos_habilitados = lista.filter(id=>permitidos.has(String(id)));
      }
    } else if (modulos_habilitados !== undefined){
      const unidade = await findUnidadeByIdWithModulosAcessiveis(unidadePrincipalExistenteId);
      const lista = normalizarListaModulos(modulos_habilitados);
      const permitidos = new Set((unidade.modulosAcessiveis||[]).map(m=>String(m._id)));
      updates.modulos_habilitados = lista.filter(id=>permitidos.has(String(id)));
    }
    await updateFuncaoById(id, updates, targetPrincipalUnitId || unidadePrincipalExistenteId || null);
    const updated = await findFuncaoByIdLean(id, targetPrincipalUnitId || unidadePrincipalExistenteId || null);
    const nomeF = updated?.nome || '';
    const rawDesc = (updated?.descricao && updated.descricao.trim()) ? updated.descricao.trim() : '';
    const codigo = updated?.codigo || '';
    const descricaoDisplay = rawDesc || (nomeF && nomeF !== codigo ? nomeF : '');
    return ok(res,{ updated:true, funcao:{ _id:updated._id, codigo, nome:nomeF, descricao: rawDesc, descricao_display: descricaoDisplay, hasDescricaoReal: !!rawDesc } });
  } catch(e){ console.error('[API FUNCOES][update] Erro:', e); return serverError(res,e); }
}

export async function getFuncoesPorUnidade(req,res){
  try {
    const unidadeId = normalizeUnitId(req.params.unidadeId);
    if (!unidadeId || unidadeId==='null') return ok(res,[]);
    if (!(await requestedUnitWithinContextCluster(req, unidadeId))) return ok(res,[]);
    const principalUnitId = await resolvePrincipalUnitId(unidadeId);
    const funcoes = await findFuncoesByPrincipalUnitIdLean(principalUnitId || unidadeId);
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
      if (!(await requestedUnitWithinContextCluster(req, unidade_cluster))) return ok(res, []);
      const principalUnitId = await resolvePrincipalUnitId(unidade_cluster);
      const filtro = { unidade_principal_id: principalUnitId };
      let funcoes = await findFuncoesByFiltroLean(filtro);
      if (q && q.trim()){
        const searchTerm = q.trim().toLowerCase();
        funcoes = funcoes.filter(f => (f.nome&&f.nome.toLowerCase().includes(searchTerm)) || (f.codigo&&f.codigo.toLowerCase().includes(searchTerm)) || (f.descricao&&f.descricao.toLowerCase().includes(searchTerm)) );
      }
      funcoes.sort((a,b)=>(a.nome||'').localeCompare(b.nome||''));
      return ok(res, funcoes.map(f=>({ _id:f._id, nome:f.nome, descricao:f.descricao||'', codigo:f.codigo||'' })) );
    }
    if (unidade_id){
      const resolvedIds = [];
      for (const candidateId of String(unidade_id).split(',').map(s=>s.trim()).filter(Boolean)) {
        if (!(await requestedUnitWithinContextCluster(req, candidateId))) continue;
        const principalUnitId = await resolvePrincipalUnitId(candidateId);
        if (principalUnitId) resolvedIds.push(principalUnitId);
      }
      const ids = [...new Set(resolvedIds)];
      if (ids.length === 0) return ok(res, []);
      const filtro = ids.length===1 ? { unidade_principal_id: ids[0] } : { unidade_principal_id:{ $in: ids } };
      const funcoes = await findFuncoesByFiltroSelectLean(filtro);
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
    const contextPrincipalUnitId = await getCanonicalContextPrincipalUnitId(req);
    const funcao = await findFuncaoById(req.params.id, contextPrincipalUnitId || null);
    if (!funcao) return notFound(res,'Função não encontrada');
    await deleteFuncaoById(req.params.id, contextPrincipalUnitId || normalizeUnitId(funcao.unidade_principal_id) || null);
    return ok(res,{ deleted:true, id:req.params.id });
  } catch(e){ console.error('[API FUNCOES][delete] Erro:', e); return serverError(res,e); }
}

// Bulk update: recebe array de objetos { _id, nome?, descricao? }
export async function bulkUpdateFuncoes(req,res){
  try {
    const itens = Array.isArray(req.body?.itens)?req.body.itens:[];
    if(!itens.length) return badRequest(res,'Lista vazia');
    const contextPrincipalUnitId = await getCanonicalContextPrincipalUnitId(req);
    const resultados=[]; let atualizados=0;
    for(const it of itens){
      const id = it._id || it.id; if(!id) { resultados.push({ ok:false, motivo:'Sem _id' }); continue; }
      const f = await findFuncaoById(id, contextPrincipalUnitId || null); if(!f){ resultados.push({ _id:id, ok:false, motivo:'Nao encontrada' }); continue; }
      if (contextPrincipalUnitId && normalizeUnitId(f.unidade_principal_id) !== contextPrincipalUnitId) {
        resultados.push({ _id:id, ok:false, motivo:'Nao encontrada' }); continue;
      }
      let changed=false;
      if(it.nome && it.nome!==f.nome){ f.nome = it.nome; changed=true; }
      if(it.descricao!==undefined && it.descricao!==f.descricao){ f.descricao = it.descricao; changed=true; }
      if(changed){ await saveFuncao(f); atualizados++; }
      resultados.push({ _id:f._id, ok:true, changed });
    }
    return ok(res,{ updated:atualizados, results:resultados });
  } catch(e){ console.error('[API FUNCOES][bulkUpdate] Erro:', e); return serverError(res,e); }
}

export default { createFuncao, getFuncao, updateFuncao, getFuncoesPorUnidade, listarFuncoesApi, deleteFuncao, bulkUpdateFuncoes };
