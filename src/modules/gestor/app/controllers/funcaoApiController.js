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
  saveFuncao,
  findUnidadeByIdWithModulosAcessiveis,
  findUnidadeUserBaseLean,
} from '#modules/gestor/app/services/apiDbBridgeService.js';
import { listarFuncoesService } from '#modules/gestor/app/services/funcoes/listarFuncoes.service.js';
import { createFuncaoContextPolicyCore } from '#modules/gestor/app/services/funcoes/createFuncaoContextPolicyCore.js';
import { deleteFuncaoScopedService } from '#modules/gestor/app/services/funcoes/deleteFuncaoScoped.service.js';
import { processCreateFuncaoCore } from './utils/processCreateFuncaoCore.js';
import { getFuncaoByIdCore } from './utils/getFuncaoByIdCore.js';
import { getFuncoesByUnitCore } from './utils/getFuncoesByUnitCore.js';
import { processBulkUpdateFuncoesItems } from './utils/processBulkUpdateFuncoes.js';
import { executeUpdateFuncaoCore } from './utils/executeUpdateFuncaoCore.js';

function normalizeUnitId(value){
  return String(value || '').trim();
}

const funcaoContextPolicy = createFuncaoContextPolicyCore({
  findUnidadeUserBaseLean,
});

function getRequestScopeContext(req) {
  return {
    scopedUnitId: req.unitScope?.unidadeId || null,
  };
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
    const context = getRequestScopeContext(req);
    const contextPrincipalUnitId = await funcaoContextPolicy.resolveCanonicalContextPrincipalUnitId(context);
    const canonicalPrincipalUnitId = contextPrincipalUnitId || normalizeUnitId(unidade_principal_id);
    if (!nome) return badRequest(res,'Nome é obrigatório');
    if (!canonicalPrincipalUnitId) return badRequest(res,'Unidade principal é obrigatória');
    const access = await funcaoContextPolicy.ensureRequestedUnitWithinContextCluster({
      ...context,
      requestedUnitId: unidade_principal_id || canonicalPrincipalUnitId,
    });
    if (!access.allowed) return notFound(res,'Unidade principal não encontrada');
    const funcao = await processCreateFuncaoCore({
      nome,
      descricao,
      canonicalPrincipalUnitId,
      modulosHabilitados: modulos_habilitados,
      findFuncaoByNome,
      findUnidadeByIdWithModulosAcessiveis,
      normalizarListaModulos,
      createFuncaoDb,
    });
    if (funcao?.error === 'Função já cadastrada') return badRequest(res,'Função já cadastrada');
    if (funcao?.error === 'Unidade inválida') return badRequest(res,'Unidade inválida');
    return created(res, funcao._id, { data:{ _id: funcao._id } });
  } catch(e){ console.error('[API FUNCOES][create] Erro:', e); return serverError(res,e); }
}

export async function getFuncao(req,res){
  try {
    const contextPrincipalUnitId = await funcaoContextPolicy.resolveCanonicalContextPrincipalUnitId(getRequestScopeContext(req));
    const funcao = await getFuncaoByIdCore({
      id: req.params.id,
      contextPrincipalUnitId,
      findFuncaoByIdPopulated,
    });
    if (!funcao) return notFound(res,'Função não encontrada');
    return ok(res, funcao);
  } catch(e){ console.error('[API FUNCOES][get] Erro:', e); return serverError(res,e); }
}

export async function updateFuncao(req,res){
  try {
    const { id } = req.params;
    const { nome, descricao, unidade_principal_id, modulos_habilitados } = req.body;
    const context = getRequestScopeContext(req);
    const contextPrincipalUnitId = await funcaoContextPolicy.resolveCanonicalContextPrincipalUnitId(context);
    const existente = await findFuncaoById(id, contextPrincipalUnitId || null);
    if (!existente) return notFound(res,'Função não encontrada');
    const updated = await executeUpdateFuncaoCore({
      id,
      nome,
      descricao,
      unidade_principal_id,
      modulos_habilitados,
      contextPrincipalUnitId,
      existente,
      normalizeUnitId,
      requestedUnitWithinContextCluster: async (unitId) => {
        const access = await funcaoContextPolicy.ensureRequestedUnitWithinContextCluster({
          ...context,
          requestedUnitId: unitId,
        });
        return access.allowed;
      },
      findOutraFuncaoByNomeExcludingId,
      findUnidadeByIdWithModulosAcessiveis,
      normalizarListaModulos,
      updateFuncaoById,
      findFuncaoByIdLean,
    });
    if (updated?.error === 'Unidade principal não encontrada') return notFound(res,'Unidade principal não encontrada');
    if (updated?.error === 'Já existe uma função com este nome') return badRequest(res,'Já existe uma função com este nome');
    if (updated?.error === 'Unidade inválida') return badRequest(res,'Unidade inválida');
    return ok(res,{ updated:true, funcao: updated });
  } catch(e){ console.error('[API FUNCOES][update] Erro:', e); return serverError(res,e); }
}

export async function getFuncoesPorUnidade(req,res){
  try {
    const context = getRequestScopeContext(req);
    const unidadeId = normalizeUnitId(req.params.unidadeId);
    if (!unidadeId || unidadeId==='null') return ok(res,[]);
    const access = await funcaoContextPolicy.ensureRequestedUnitWithinContextCluster({
      ...context,
      requestedUnitId: unidadeId,
    });
    if (!access.allowed) return ok(res,[]);
    const principalUnitId = await funcaoContextPolicy.resolvePrincipalUnitId(unidadeId);
    const funcoes = await getFuncoesByUnitCore({
      effectiveUnitId: principalUnitId || unidadeId,
      findFuncoesByPrincipalUnitIdLean,
    });
    return ok(res, funcoes);
  } catch(e){ console.error('[API FUNCOES][getPorUnidade] Erro:', e); return serverError(res,e); }
}

export async function listarFuncoesApi(req,res){
  try {
    const funcoes = await listarFuncoesService({ query: req.query, unitScope: req.unitScope });
    return ok(res, funcoes);
  } catch(e){ console.error('[API FUNCOES][listar] Erro:', e); return serverError(res,e); }
}

export async function deleteFuncao(req,res){
  try {
    const contextPrincipalUnitId = await funcaoContextPolicy.resolveCanonicalContextPrincipalUnitId(getRequestScopeContext(req));
    const funcao = await deleteFuncaoScopedService({
      funcaoId: req.params.id,
      canonicalPrincipalUnitId: contextPrincipalUnitId || null,
    });
    if (!funcao) return notFound(res,'Função não encontrada');
    return ok(res,{ deleted:true, id:req.params.id });
  } catch(e){ console.error('[API FUNCOES][delete] Erro:', e); return serverError(res,e); }
}

// Bulk update: recebe array de objetos { _id, nome?, descricao? }
export async function bulkUpdateFuncoes(req,res){
  try {
    const itens = Array.isArray(req.body?.itens)?req.body.itens:[];
    if(!itens.length) return badRequest(res,'Lista vazia');
    const contextPrincipalUnitId = await funcaoContextPolicy.resolveCanonicalContextPrincipalUnitId(getRequestScopeContext(req));
    const bulkResult = await processBulkUpdateFuncoesItems({
      itens,
      contextPrincipalUnitId,
      findFuncaoById,
      saveFuncao,
      normalizeUnitId,
    });
    return ok(res,{ updated:bulkResult.updated, results:bulkResult.results });
  } catch(e){ console.error('[API FUNCOES][bulkUpdate] Erro:', e); return serverError(res,e); }
}

export default { createFuncao, getFuncao, updateFuncao, getFuncoesPorUnidade, listarFuncoesApi, deleteFuncao, bulkUpdateFuncoes };
