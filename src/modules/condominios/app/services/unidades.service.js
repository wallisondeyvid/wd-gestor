import { BlocosRepository } from '#modules/condominios/app/repositories/BlocosRepository.js';
import { AndaresRepository } from '#modules/condominios/app/repositories/AndaresRepository.js';
import { UnidadesRepository } from '#modules/condominios/app/repositories/UnidadesRepository.js';

export async function listarUnidadesService({
  req,
  mongoose,
  getCtxUser,
  userCanScopeAll,
  normalizeObjectIdString,
  getUserUnidadeId,
  resolveUnidadeIdForNonScopedUser,
  listarUnidadesParaUsuario,
  buildUnidadePayload
}) {
  const canQueryDb = !(req?.app?.locals?.skipDb) && mongoose.connection.readyState === 1;
  let ctxUser = getCtxUser(req);
  const canScopeAllUnits = userCanScopeAll(ctxUser);

  if (!canScopeAllUnits) {
    const current = normalizeObjectIdString(getUserUnidadeId(ctxUser));
    if (!current) {
      try {
        const resolved = await resolveUnidadeIdForNonScopedUser({ ctxUser, canQueryDb });
        if (resolved) ctxUser = { ...(ctxUser || {}), unidade_id: resolved };
      } catch {
      }
    }
  }

  const unidadesOptions = await listarUnidadesParaUsuario(ctxUser);
  const payload = (unidadesOptions || []).map(unit => {
    const enriched = buildUnidadePayload(unit);
    if(enriched) return enriched;
    return {
      _id: unit && unit._id ? unit._id : null,
      codigo: unit && unit.codigo || '',
      nome: unit && unit.nome || ''
    };
  });

  return payload;
}

export async function obterUnidadePorIdService({
  req,
  mongoose,
  Unidade,
  buildUnidadePayload
}) {
  const repo = new UnidadesRepository({ unitScope: req.unitScope });
  const id = String(req.params?.id || '').trim();
  if (!id || !mongoose.isValidObjectId(id)) {
    const err = new Error('Identificador inválido');
    err.__httpStatus = 400;
    err.__httpPayload = { error: 'Identificador inválido' };
    throw err;
  }

  if (mongoose.connection.readyState !== 1) {
    const err = new Error('DB indisponível');
    err.__httpStatus = 503;
    err.__httpPayload = { error: 'DB indisponível' };
    err.__retryAfter = '5';
    throw err;
  }

  const unidade = await repo.findById({ id });
  if (!unidade) {
    const err = new Error('Unidade não encontrada');
    err.__httpStatus = 404;
    err.__httpPayload = { error: 'Unidade não encontrada' };
    throw err;
  }

  const payload = buildUnidadePayload(unidade);
  return payload || {
    _id: unidade && unidade._id ? unidade._id : null,
    codigo: unidade && unidade.codigo || '',
    nome: unidade && unidade.nome || ''
  };
}

export async function listarUnidadesRelacionadasService({
  req,
  mongoose,
  Unidade,
  CondBloco,
  CondAndar,
  buildUnidadePayload
}) {
  const repo = new UnidadesRepository({ unitScope: req.unitScope });
  const blocosRepo = new BlocosRepository({ unitScope: req.unitScope });
  const andaresRepo = new AndaresRepository({ unitScope: req.unitScope });

  if (mongoose.connection.readyState !== 1) {
    const err = new Error('DB indisponível');
    err.__httpStatus = 503;
    err.__httpPayload = { error: 'DB indisponível' };
    err.__retryAfter = '5';
    throw err;
  }

  const condominioId = String(req.query?.condominioId || '').trim();
  const blocoId = String(req.query?.blocoId || '').trim();
  const andarId = String(req.query?.andarId || '').trim();

  const unidadeIds = [];

  if (condominioId && mongoose.isValidObjectId(condominioId)) {
    unidadeIds.push(String(condominioId));
  }

  if (blocoId && mongoose.isValidObjectId(blocoId)) {
    const unidadeId = await blocosRepo.getUnidadeIdByBlocoId(blocoId);
    if (unidadeId) unidadeIds.push(String(unidadeId));
  }

  if (andarId && mongoose.isValidObjectId(andarId)) {
    const unidadeId = await andaresRepo.getUnidadeIdByAndarId(andarId);
    if (unidadeId) unidadeIds.push(String(unidadeId));
  }

  let filtro = {};
  const idsUnicos = [...new Set(unidadeIds.filter(Boolean))];
  if (idsUnicos.length === 1) {
    filtro = { _id: idsUnicos[0] };
  } else if (idsUnicos.length > 1) {
    const todosIguais = idsUnicos.every(id => id === idsUnicos[0]);
    if (!todosIguais) return [];
    filtro = { _id: idsUnicos[0] };
  }

  const unidades = await repo.findMany({ filter: filtro });
  return (unidades || []).map(unit => {
    const payload = buildUnidadePayload(unit);
    if (payload) return payload;
    return {
      _id: unit && unit._id ? unit._id : null,
      codigo: unit && unit.codigo || '',
      nome: unit && unit.nome || ''
    };
  });
}