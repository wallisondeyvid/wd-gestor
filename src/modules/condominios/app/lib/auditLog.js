import mongoose from 'mongoose';
import CondAuditLog from '#models/cond_audit_log.js';

function safeStr(v, max = 400) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  return s.length > max ? s.slice(0, max) : s;
}

function getActorFromCtxUser(ctxUser, source = '') {
  try {
    const idRaw = ctxUser?._id || ctxUser?.id || ctxUser?.userId || null;
    const userId = idRaw && mongoose.isValidObjectId(idRaw) ? idRaw : null;
    return {
      userId,
      nome: safeStr(ctxUser?.nome || ctxUser?.name || ''),
      email: safeStr(ctxUser?.email || ctxUser?.userEmail || ''),
      role: safeStr(ctxUser?.role || ''),
      source: safeStr(source || '')
    };
  } catch {
    return { userId: null, nome: '', email: '', role: '', source: safeStr(source || '') };
  }
}

function getRequestInfo(req) {
  try {
    const ua = safeStr(req?.headers?.['user-agent'] || req?.headers?.['User-Agent'] || '', 180);
    const ip = safeStr(req?.ip || req?.headers?.['x-forwarded-for'] || '', 90);
    const path = safeStr(req?.originalUrl || req?.url || '', 240);
    const method = safeStr(req?.method || '', 12);
    return { ip, ua, path, method };
  } catch {
    return { ip: '', ua: '', path: '', method: '' };
  }
}

export async function writeAuditLog({
  req,
  ctxUser,
  source,
  unidadeId,
  assembleiaId,
  entityType,
  entityId,
  action,
  payload
}) {
  try {
    if (!CondAuditLog) return null;
    if (req?.app?.locals?.skipDb) return null;
    if (mongoose.connection.readyState !== 1) return null;

    const doc = await CondAuditLog.create({
      module: 'condominios',
      entityType: safeStr(entityType || ''),
      entityId: (entityId && mongoose.isValidObjectId(entityId)) ? entityId : null,
      action: safeStr(action || ''),
      unidade_id: (unidadeId && mongoose.isValidObjectId(unidadeId)) ? unidadeId : null,
      assembleia_id: (assembleiaId && mongoose.isValidObjectId(assembleiaId)) ? assembleiaId : null,
      actor: getActorFromCtxUser(ctxUser, source),
      request: getRequestInfo(req),
      payload: payload ?? null
    });
    return doc;
  } catch {
    return null;
  }
}
