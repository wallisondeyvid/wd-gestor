import { AndaresRepository } from '#modules/condominios/app/repositories/AndaresRepository.js';
import { BlocosRepository } from '#modules/condominios/app/repositories/BlocosRepository.js';

export async function listarAndaresService({
  req,
  mongoose,
  listarUnidadesParaUsuario
}) {
  const repo = new AndaresRepository({ unitScope: req.unitScope });
  const unidade = req.query.unidade || req.query.unidade_id || '';

  if (unidade && !mongoose.isValidObjectId(String(unidade))) {
    const err = new Error('unidade_id inválido');
    err.__httpStatus = 400;
    err.__httpPayload = { error: 'unidade_id inválido' };
    throw err;
  }

  if (mongoose.connection.readyState !== 1) {
    const err = new Error('DB indisponível');
    err.__httpStatus = 503;
    err.__httpPayload = { error: 'DB indisponível' };
    err.__retryAfter = '5';
    throw err;
  }

  let q = { ativo: { $ne: false } };
  if (unidade) {
    q.unidade_id = unidade;
  } else {
    try {
      const ctxUser = req.user || (req.session && req.session.user) || null;
      const unidadesOptions = await listarUnidadesParaUsuario(ctxUser);
      const isAdmin = ctxUser && (ctxUser.isMaster || ctxUser.role === 'master' || ctxUser.role === 'admin');
      if (!isAdmin) {
        const unitIds = (unidadesOptions||[]).map(u => u._id);
        if (!unitIds.length) {
          q._id = { $exists: false };
        } else {
          q.unidade_id = { $in: unitIds };
        }
      }
    } catch(_e){ }
  }

  const andares = await repo.findMany({
    filter: q,
    selectFields: '_id nome numero unidade_id ordem',
    sort: { ordem: 1, numero: 1, nome: 1 },
  });
  return andares || [];
}

export async function obterAndarPorIdService({
  req,
  mongoose,
  CondAndar
}) {
  const repo = new AndaresRepository({ unitScope: req.unitScope });
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

  const andar = await repo.findById({ id, selectFields: '_id nome numero unidade_id ordem' });
  if (!andar) {
    const err = new Error('Andar não encontrado');
    err.__httpStatus = 404;
    err.__httpPayload = { error: 'Andar não encontrado' };
    throw err;
  }

  return andar;
}

export async function listarAndaresRelacionadosService({
  req,
  mongoose,
  CondAndar,
  CondBloco
}) {
  const repo = new AndaresRepository({ unitScope: req.unitScope });
  const blocosRepo = new BlocosRepository({ unitScope: req.unitScope });
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

  let q = { ativo: { $ne: false } };
  if (condominioId && mongoose.isValidObjectId(condominioId)) {
    q.unidade_id = condominioId;
  }

  if (blocoId && mongoose.isValidObjectId(blocoId)) {
    const unidadeId = await blocosRepo.getUnidadeIdByBlocoId(blocoId);
    if (!unidadeId) return [];
    if (q.unidade_id && String(q.unidade_id) !== String(unidadeId)) return [];
    q.unidade_id = unidadeId;
  }

  if (andarId && mongoose.isValidObjectId(andarId)) {
    q._id = andarId;
  }

  const andares = await repo.findMany({
    filter: q,
    selectFields: '_id nome numero unidade_id ordem',
    sort: { ordem: 1, numero: 1, nome: 1 },
  });
  return andares || [];
}