import { AndaresRepository } from '#modules/condominios/app/repositories/AndaresRepository.js';
import { BlocosRepository } from '#modules/condominios/app/repositories/BlocosRepository.js';
import { createUnitScope } from '#shared/unitScope.js';

function unitScopeFromUnidadeId(unidadeId) {
  return unidadeId ? createUnitScope({ unidadeId }) : { type: 'global', unidadeId: null };
}

export async function listarBlocosService({
  req,
  mongoose,
  listarUnidadesParaUsuario,
  CondBloco
}) {
  const repo = new BlocosRepository({ unitScope: req.unitScope });
  const unidade = req.query.unidade || req.query.unidade_id || '';

  if (unidade && !mongoose.isValidObjectId(String(unidade))) {
    return [];
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

  const blocos = await repo.findMany({
    filter: q,
    selectFields: '_id nome unidade_id ordem',
    sort: { ordem: 1, nome: 1 },
  });
  return blocos || [];
}

function assertDbAvailable({ mongoose, skipDb }) {
  if (skipDb === true || mongoose.connection.readyState !== 1) {
    const err = new Error('DB indisponível');
    err.__httpStatus = 503;
    err.__httpPayload = { error: 'DB indisponível' };
    err.__retryAfter = '5';
    throw err;
  }
}

export async function criarBlocoService({
  body,
  mongoose,
  skipDb,
  CondBloco
}) {
  const { unidade_id, nome, ordem } = body || {};
  const unidadeIdDerivado = (unidade_id && mongoose.isValidObjectId(String(unidade_id))) ? String(unidade_id) : '';
  const repo = new BlocosRepository({ unitScope: unitScopeFromUnidadeId(unidadeIdDerivado) });
  assertDbAvailable({ mongoose, skipDb });

  if (!unidade_id || !nome) {
    const err = new Error('Dados obrigatórios ausentes');
    err.__httpStatus = 400;
    err.__httpPayload = { error: 'unidade_id e nome são obrigatórios' };
    throw err;
  }

  const nomeNorm = String(nome).trim();
  const existente = await repo.findOne({
    filter: { unidade_id, nome: nomeNorm },
  });
  if (existente) {
    return { status: 200, payload: existente, created: false };
  }

  try {
    const novo = await repo.create({ unidade_id, nome: nomeNorm, ordem: Number(ordem) || 0 });
    return { status: 201, payload: novo, created: true };
  } catch (e) {
    const isDup = e && (e.code === 11000 || String(e.message || '').includes('duplicate key'));
    if (isDup) {
      const err = new Error('Bloco duplicado');
      err.__httpStatus = 409;
      err.__httpPayload = { error: 'Bloco já existe para este condomínio' };
      throw err;
    }
    const err = new Error('Falha ao criar bloco');
    err.__httpStatus = 500;
    err.__httpPayload = { error: 'Falha ao criar bloco' };
    err.__cause = e;
    throw err;
  }
}

export async function atualizarBlocoService({
  unitScope,
  id,
  body,
  mongoose,
  skipDb,
  CondBloco
}) {
  console.warn('[atualizarBlocoService][input]', {
    unitScope: unitScope ?? null,
    id,
    skipDb: skipDb === true
  });
  const repo = new BlocosRepository({ unitScope });
  assertDbAvailable({ mongoose, skipDb });
  try {
    const { nome, ordem, ativo } = body || {};
    const upd = {};
    if (nome != null) upd.nome = String(nome).trim();
    if (ordem != null) upd.ordem = Number(ordem) || 0;
    if (ativo != null) upd.ativo = !!ativo;
    const payload = await repo.updateById({ id, set: upd });
    return { status: 200, payload };
  } catch (e) {
    const err = new Error('Falha ao atualizar bloco');
    err.__httpStatus = 500;
    err.__httpPayload = { error: 'Falha ao atualizar bloco' };
    err.__cause = e;
    throw err;
  }
}

export async function excluirBlocoService({
  unitScope,
  id,
  mongoose,
  skipDb,
  CondBloco
}) {
  console.warn('[excluirBlocoService][input]', {
    unitScope: unitScope ?? null,
    id,
    skipDb: skipDb === true
  });
  const repo = new BlocosRepository({ unitScope });
  assertDbAvailable({ mongoose, skipDb });
  try {
    await repo.deleteById({ id });
    return { status: 200, payload: { ok: true } };
  } catch (e) {
    const err = new Error('Falha ao excluir bloco');
    err.__httpStatus = 500;
    err.__httpPayload = { error: 'Falha ao excluir bloco' };
    err.__cause = e;
    throw err;
  }
}

export async function obterBlocoPorIdService({
  req,
  mongoose,
  CondBloco
}) {
  const repo = new BlocosRepository({ unitScope: req.unitScope });
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

  const bloco = await repo.findById({ id, selectFields: '_id nome unidade_id ordem' });
  if (!bloco) {
    const err = new Error('Bloco não encontrado');
    err.__httpStatus = 404;
    err.__httpPayload = { error: 'Bloco não encontrado' };
    throw err;
  }

  return bloco;
}

export async function listarBlocosRelacionadosService({
  req,
  mongoose,
  CondBloco,
  CondAndar
}) {
  const repo = new BlocosRepository({ unitScope: req.unitScope });
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

  let q = { ativo: { $ne: false } };
  if (condominioId && mongoose.isValidObjectId(condominioId)) {
    q.unidade_id = condominioId;
  }

  if (blocoId && mongoose.isValidObjectId(blocoId)) {
    q._id = blocoId;
  }

  if (andarId && mongoose.isValidObjectId(andarId)) {
    const unidadeId = await andaresRepo.getUnidadeIdByAndarId(andarId);
    if (!unidadeId) return [];
    if (q.unidade_id && String(q.unidade_id) !== String(unidadeId)) return [];
    q.unidade_id = unidadeId;
  }

  const blocos = await repo.findMany({
    filter: q,
    selectFields: '_id nome unidade_id ordem',
    sort: { ordem: 1, nome: 1 },
  });
  return blocos || [];
}