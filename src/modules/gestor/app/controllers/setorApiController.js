// setorApiController.js - API de Setores (migrado)
import { ok, created, badRequest, notFound, serverError } from '#core/utils/apiResponse.js';
import {
  findUnidadeById,
  findSetorByUnidadeAndNomeNormalizadoLean,
  createSetor as createSetorDb,
  findSetoresByUnidadeIdPopulateLean,
  findSetorByIdPopulateUnidade,
  findSetorDupByNomeNormalizadoExcludingId,
  saveSetor,
  findSetoresByFiltroPopulateUnidadeLean,
  findUnidadesByIdsNomeCodigoLean,
  findCounterSetorCodigoLean,
  findMaxSetorCodigoLean,
  findOneAndUpdateCounterSetorCodigo,
} from '#modules/gestor/app/services/apiDbBridgeService.js';
import { deleteSetorScopedService } from '#modules/gestor/app/services/setores/deleteSetorScoped.service.js';
import { updateSetorScopedService } from '#modules/gestor/app/services/setores/updateSetorScoped.service.js';
import { processCreateSetorCore } from './utils/processCreateSetorCore.js';
import { getSetorByIdCore } from './utils/getSetorByIdCore.js';

function normalizeUnitId(value) {
	return String(value || '').trim();
}

function isMasterOrAdmin(req) {
	return req.user?.isMaster || req.user?.role === 'admin';
}

function getScopedUnitId(req) {
	return normalizeUnitId(req.unitScope?.unidadeId);
}

function getCanonicalContextUnitId(req) {
  return getScopedUnitId(req);
}

function requestedUnitMatchesContext(req, requestedUnitId) {
	const requested = normalizeUnitId(requestedUnitId);
	if (!requested) return true;

  const canonicalContextUnitId = getCanonicalContextUnitId(req);
  if (canonicalContextUnitId) return canonicalContextUnitId === requested;

	return true;
}

// Helper para resposta 409
function conflict(res, message, extra={}) {
  return res.status(409).json({ error: message, ...extra });
}

export async function createSetor(req,res){
  try {
    let { nome, descricao, unidade_id } = req.body;
    const canonicalUnitId = getCanonicalContextUnitId(req) || normalizeUnitId(unidade_id);
    if (!nome) return badRequest(res,'Nome é obrigatório');
    if (!canonicalUnitId) return badRequest(res,'Unidade é obrigatória');
    if (!requestedUnitMatchesContext(req, unidade_id || canonicalUnitId)) return notFound(res,'Unidade não encontrada');
    const setor = await processCreateSetorCore({
      nome,
      descricao,
      canonicalUnitId,
      findSetorByUnidadeAndNomeNormalizadoLean,
      createSetorDb,
    });
    if (setor?.error === 'duplicate_name') {
      return conflict(res,'Setor já cadastrado nesta unidade', { duplicateField:'nome', duplicateValue: nome, duplicateId: setor.duplicateId });
    }
    return created(res, setor._id, { data:{ _id:setor._id, codigo: setor.codigo } });
  } catch(e){
    if (e && e.code === 11000) {
      const kp = e.keyPattern || {};
      const kv = e.keyValue || {};
      console.error('[API SETORES][create][dup11000]', { keyPattern: kp, keyValue: kv, message: e.message });
      if (kp.codigo) {
        return conflict(res,'Código de setor duplicado (falha na sequência). Tente novamente.', { duplicateField:'codigo', duplicateValue: kv.codigo, needsSequenceCheck:true });
      }
      return conflict(res,'Setor já cadastrado nesta unidade', { driverDuplicate:true, keyPattern: kp, keyValue: kv });
    }
    console.error('[API SETORES][create] Erro:', e);
    return serverError(res,e);
  }
}

export async function getSetoresPorUnidade(req,res){
  try {
    const unidadeId = getCanonicalContextUnitId(req) || normalizeUnitId(req.params.unidadeId);
    if (!unidadeId || unidadeId==='null') return ok(res,[]);
    const setores = await findSetoresByUnidadeIdPopulateLean(unidadeId);
    return ok(res,setores);
  } catch(e){ console.error('[API SETORES][getPorUnidade] Erro:', e); return serverError(res,e); }
}

export async function getSetor(req,res){
  try {
    const canonicalUnitId = getCanonicalContextUnitId(req) || null;
    const setor = await getSetorByIdCore({
      id: req.params.id,
      canonicalUnitId,
      findSetorByIdPopulateUnidade,
    });
    if (!setor) return notFound(res,'Setor não encontrado');
    return ok(res, setor);
  } catch(e){ console.error('[API SETORES][get] Erro:', e); return serverError(res,e); }
}

export async function updateSetor(req,res){
  try {
    let { nome, descricao, unidade_id } = req.body;
    const canonicalUnitId = getCanonicalContextUnitId(req) || normalizeUnitId(unidade_id);
    if (unidade_id && !requestedUnitMatchesContext(req, unidade_id)) return notFound(res,'Unidade não encontrada');
    const result = await updateSetorScopedService({
      setorId: req.params.id,
      canonicalUnitId: canonicalUnitId || null,
      changes: { nome, descricao },
    });
    if (result.kind === 'not_found') return notFound(res,'Setor não encontrado');
    if (result.kind === 'duplicate_name') return badRequest(res,'Já existe outro setor com este nome nesta unidade.');
    return ok(res,{ updated:true });
  } catch(e){
    if (e && e.code === 11000) {
      return badRequest(res,'Já existe um setor com este nome nesta unidade (duplicado).');
    }
    console.error('[API SETORES][update] Erro:', e);
    return serverError(res,e);
  }
}

export async function listarSetores(req,res){
  try {
    const { unidade_id } = req.query;
    let filtro = {};
    const canonicalUnitId = getScopedUnitId(req);

    if (canonicalUnitId) {
      filtro.unidade_id = canonicalUnitId;
    } else if (unidade_id) {
      filtro.unidade_id = unidade_id;
    }

    if (!canonicalUnitId && !isMasterOrAdmin(req)) {
      return ok(res, []);
    }
    const setores = await findSetoresByFiltroPopulateUnidadeLean(filtro);

    // Fallback: construir mapa de unidades se algum setor veio sem populate resolvido
    let needsLookup = setores.some(s => s.unidade_id && typeof s.unidade_id === 'string');
    const unidadeIdsRaw = new Set();
    if (needsLookup) {
      setores.forEach(s => { if (s.unidade_id && typeof s.unidade_id === 'string') unidadeIdsRaw.add(s.unidade_id); });
    }
    let unidadesMap = {};
    if (unidadeIdsRaw.size) {
      const unidadesDB = await findUnidadesByIdsNomeCodigoLean(Array.from(unidadeIdsRaw));
      unidadesDB.forEach(u => { unidadesMap[String(u._id)] = u; });
    }

    const mapped = setores.map((s) => {
      let unidade_nome = '';
      let unidade_label = '';
      let unidade_id_raw = null;
      if (s.unidade_id) {
        if (typeof s.unidade_id === 'object' && s.unidade_id !== null) {
          const codigo = s.unidade_id.codigo || '';
          const nome = s.unidade_id.nome || '';
          unidade_label = codigo && nome ? `${codigo} - ${nome}` : (nome || codigo || '');
          unidade_nome = unidade_label;
          unidade_id_raw = s.unidade_id._id || null;
        } else if (typeof s.unidade_id === 'string') {
          unidade_id_raw = s.unidade_id;
          const u = unidadesMap[s.unidade_id];
          if (u) {
            const codigo = u.codigo || '';
            const nome = u.nome || '';
            unidade_label = codigo && nome ? `${codigo} - ${nome}` : (nome || codigo || '');
            unidade_nome = unidade_label;
          }
        }
      }
      return { ...s, unidade_nome, unidade_label, unidade_id_raw };
    });
    return ok(res, mapped);
  } catch(e){ console.error('[API SETORES][listar] Erro:', e); return serverError(res,e); }
}

export async function deleteSetor(req,res){
  try {
    const unidadeId = getCanonicalContextUnitId(req) || null;
    const setor = await deleteSetorScopedService({ setorId: req.params.id, unidadeId });
    if (!setor) return notFound(res,'Setor não encontrado');
    return ok(res,{ deleted:true, id:req.params.id });
  } catch(e){ console.error('[API SETORES][delete] Erro:', e); return serverError(res,e); }
}

// Endpoint temporário de debug: retorna setores "crus" (sem populate / sem mapeamento)
// Query params opcionais:
//   unidade_id: filtra por unidade
//   limit: número máximo (default 100)
//   fields: lista separada por vírgula (ex: nome,unidade_id,descricao)
export default { createSetor, getSetoresPorUnidade, getSetor, updateSetor, listarSetores, deleteSetor }; 
// Funções auxiliares de debug (não exportadas por default)
export async function debugGetCounter(req,res){
  try {
    const doc = await findCounterSetorCodigoLean();
    const maxSetor = await findMaxSetorCodigoLean();
    const maxCodigo = maxSetor.length ? maxSetor[0].codigo : null;
    return ok(res,{ counter: doc || null, maxCodigo });
  } catch(e){ return serverError(res,e); }
}

export async function debugFixCounter(req,res){
  try {
    const maxSetor = await findMaxSetorCodigoLean();
    const maxCodigo = maxSetor.length ? maxSetor[0].codigo : null;
    let targetSeq = 0;
    if (maxCodigo) {
      const num = Number(maxCodigo.slice(1));
      if (Number.isFinite(num)) targetSeq = num;
    }
    const doc = await findOneAndUpdateCounterSetorCodigo(targetSeq);
    return ok(res,{ fixed:true, counter: doc, maxCodigo });
  } catch(e){ return serverError(res,e); }
}
