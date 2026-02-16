export async function listarBlocosService({
  req,
  mongoose,
  listarUnidadesParaUsuario,
  CondBloco
}) {
  const unidade = req.query.unidade || req.query.unidade_id || '';

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
        q.unidade_id = { $in: unitIds.length ? unitIds : ['__none__'] };
      }
    } catch(_e){ }
  }

  const blocos = await CondBloco.find(q).select('_id nome unidade_id ordem').sort({ ordem: 1, nome: 1 }).lean();
  return blocos || [];
}

export async function obterBlocoPorIdService({
  req,
  mongoose,
  CondBloco
}) {
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

  const bloco = await CondBloco.findById(id).select('_id nome unidade_id ordem').lean();
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
    const andar = await CondAndar.findById(andarId).select('unidade_id').lean();
    if (!andar?.unidade_id) return [];
    if (q.unidade_id && String(q.unidade_id) !== String(andar.unidade_id)) return [];
    q.unidade_id = andar.unidade_id;
  }

  const blocos = await CondBloco.find(q).select('_id nome unidade_id ordem').sort({ ordem: 1, nome: 1 }).lean();
  return blocos || [];
}