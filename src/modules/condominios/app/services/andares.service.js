export async function listarAndaresService({
  req,
  mongoose,
  listarUnidadesParaUsuario,
  CondAndar
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

  const andares = await CondAndar.find(q).select('_id nome numero unidade_id ordem').sort({ ordem: 1, numero: 1, nome: 1 }).lean();
  return andares || [];
}