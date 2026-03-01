// setorApiController.js - API de Setores (migrado)
import { ok, created, badRequest, notFound, serverError } from '#core/utils/apiResponse.js';
import {
  findUnidadeById,
  findSetorByUnidadeAndNomeNormalizadoLean,
  createSetor as createSetorDb,
  findSetoresByUnidadeIdPopulateLean,
  findSetorByIdPopulateUnidade,
  findSetorById,
  findSetorDupByNomeNormalizadoExcludingId,
  saveSetor,
  findUnidadeUserBaseSetorLean,
  findUnidadesByCondLean,
  findSetoresByFiltroPopulateUnidadeLean,
  findUnidadesByIdsNomeCodigoLean,
  findSetorByIdAndDelete,
  findCounterSetorCodigoLean,
  findMaxSetorCodigoLean,
  findOneAndUpdateCounterSetorCodigo,
} from '#modules/gestor/app/db/api.db.js';

// Helper para resposta 409
function conflict(res, message, extra={}) {
  return res.status(409).json({ error: message, ...extra });
}

export async function createSetor(req,res){
  try {
    let { nome, descricao, unidade_id } = req.body;
    if (!nome) return badRequest(res,'Nome é obrigatório');
    if (!unidade_id) return badRequest(res,'Unidade é obrigatória');
    const nomeNormalizado = String(nome).trim().replace(/\s+/g,' ').toLowerCase();
    const unidade = await findUnidadeById(unidade_id);
    if (!unidade) return badRequest(res,'Unidade inválida');
    const existing = await findSetorByUnidadeAndNomeNormalizadoLean(unidade_id, nomeNormalizado);
    if (existing) {
      return conflict(res,'Setor já cadastrado nesta unidade', { duplicateField:'nome', duplicateValue: nome, duplicateId: existing._id });
    }
    const setor = await createSetorDb({ nome, nome_normalizado: nomeNormalizado, descricao, unidade_id });
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
    const { unidadeId } = req.params;
    if (!unidadeId || unidadeId==='null') return ok(res,[]);
    const setores = await findSetoresByUnidadeIdPopulateLean(unidadeId);
    return ok(res,setores);
  } catch(e){ console.error('[API SETORES][getPorUnidade] Erro:', e); return serverError(res,e); }
}

export async function getSetor(req,res){
  try {
    const setor = await findSetorByIdPopulateUnidade(req.params.id);
    if (!setor) return notFound(res,'Setor não encontrado');
    return ok(res,{ _id:setor._id, nome:setor.nome, descricao:setor.descricao||'', unidade_id: setor.unidade_id ? setor.unidade_id._id : null });
  } catch(e){ console.error('[API SETORES][get] Erro:', e); return serverError(res,e); }
}

export async function updateSetor(req,res){
  try {
    let { nome, descricao, unidade_id } = req.body;
    const setor = await findSetorById(req.params.id);
    if (!setor) return notFound(res,'Setor não encontrado');
    if (unidade_id && String(setor.unidade_id)!==String(unidade_id)){
      const unidade = await findUnidadeById(unidade_id);
      if (!unidade) return badRequest(res,'Unidade inválida');
      setor.unidade_id = unidade_id;
    }
    if (nome){
      const nomeNormalizado = String(nome).trim().replace(/\s+/g,' ').toLowerCase();
      // Verifica se outro setor já usa esse nome na mesma unidade
      const dup = await findSetorDupByNomeNormalizadoExcludingId(setor._id, setor.unidade_id, nomeNormalizado);
      if (dup) return badRequest(res,'Já existe outro setor com este nome nesta unidade.');
      setor.nome = nome; // será normalizado pelo hook + nome_normalizado será ajustado
      setor.nome_normalizado = nomeNormalizado;
    }
    setor.descricao = descricao || '';
    await saveSetor(setor);
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
    if (unidade_id) {
      filtro.unidade_id = unidade_id;
    }
    // Restringir por escopo do usuário (exceto admin/master)
    if (!(req.user?.isMaster || req.user?.role === 'admin')) {
      let principalId = req.user?.unidade_principal_id;
      if (!principalId && req.user?.unidade_id) {
        const u = await findUnidadeUserBaseSetorLean(req.user.unidade_id);
        if (u) principalId = u.is_principal ? u._id : u.unidade_principal_id;
      }
      const cond = principalId ? { $or: [{ _id: principalId }, { unidade_principal_id: principalId }] } : { _id: req.user?.unidade_id || null };
      const unidadesAcessiveis = await findUnidadesByCondLean(cond);
      const ids = unidadesAcessiveis.map(u => String(u._id));
      filtro.unidade_id = filtro.unidade_id ? filtro.unidade_id : { $in: ids };
      if (typeof filtro.unidade_id === 'string' && !ids.includes(String(filtro.unidade_id))) {
        // Se query pedir unidade fora do escopo, retornar vazio
        return ok(res, []);
      }
      if (filtro.unidade_id && filtro.unidade_id.$in && filtro.unidade_id.$in.length === 0) {
        return ok(res, []);
      }
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
    const setor = await findSetorById(req.params.id);
    if (!setor) return notFound(res,'Setor não encontrado');
    await findSetorByIdAndDelete(req.params.id);
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
