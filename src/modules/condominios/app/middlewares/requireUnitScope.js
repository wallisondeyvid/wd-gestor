import mongoose from 'mongoose';
import { createUnitScope } from '#shared/unitScope.js';

function normalizeObjectIdString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = normalizeObjectIdString(value);
    if (normalized) return normalized;
  }
  return '';
}

function resolveUser(req) {
  return req?.user || req?.session?.user || null;
}

function resolveUnidadeId(req) {
  const user = resolveUser(req);

  return firstNonEmpty(
    req?.query?.unidadeId,
    req?.query?.unidade_id,
    req?.params?.unidadeId,
    req?.params?.unidade_id,
    req?.body?.unidadeId,
    req?.body?.unidade_id,
    user?.matriz_unidade_id,
    user?.unidade_principal_id,
    user?.unidade_id
  );
}

function isMultiTenantEnforced() {
  return String(process.env.WDG_MULTI_TENANT || '').trim() === '1';
}

function shouldDebugBlocosWrite(req) {
  const method = String(req?.method || '').toUpperCase();
  const path = String(req?.path || req?.originalUrl || '').split('?')[0];
  return (method === 'PUT' || method === 'DELETE') && /^\/api\/blocos\/[^/]+$/.test(path);
}

export function requireUnitScope(req, res, next) {
  const unidadeId = resolveUnidadeId(req);
  const enforce = isMultiTenantEnforced();

  if (shouldDebugBlocosWrite(req)) {
    console.warn('[requireUnitScope][blocos-write][input]', {
      method: req.method,
      path: req.path,
      unidadeId,
      queryUnidadeId: req?.query?.unidadeId ?? null,
      queryUnidade_id: req?.query?.unidade_id ?? null,
      bodyUnidadeId: req?.body?.unidadeId ?? null,
      bodyUnidade_id: req?.body?.unidade_id ?? null,
      enforce,
    });
  }

  if (!unidadeId || !mongoose.isValidObjectId(unidadeId)) {
    if (enforce) {
      if (shouldDebugBlocosWrite(req)) {
        console.warn('[requireUnitScope][blocos-write][reject]', {
          method: req.method,
          path: req.path,
          unidadeId,
          reason: 'UNIDADE_ID_REQUIRED'
        });
      }
      return res.status(400).json({ success: false, error: 'UNIDADE_ID_REQUIRED' });
    }

    req.unitScope = createUnitScope({ unidadeId: null });
    if (shouldDebugBlocosWrite(req)) {
      console.warn('[requireUnitScope][blocos-write][set-global]', {
        method: req.method,
        path: req.path,
        unitScope: req.unitScope
      });
    }
    return next();
  }

  req.unitScope = createUnitScope({ unidadeId });
  if (shouldDebugBlocosWrite(req)) {
    console.warn('[requireUnitScope][blocos-write][set-unit]', {
      method: req.method,
      path: req.path,
      unitScope: req.unitScope
    });
  }
  return next();
}

export default requireUnitScope;
