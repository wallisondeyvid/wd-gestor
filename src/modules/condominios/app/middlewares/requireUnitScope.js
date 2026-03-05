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

export function requireUnitScope(req, res, next) {
  const unidadeId = resolveUnidadeId(req);
  const enforce = isMultiTenantEnforced();

  if (!unidadeId || !mongoose.isValidObjectId(unidadeId)) {
    if (enforce) {
      return res.status(400).json({ success: false, error: 'UNIDADE_ID_REQUIRED' });
    }

    req.unitScope = createUnitScope({ unidadeId: null });
    return next();
  }

  req.unitScope = createUnitScope({ unidadeId });
  return next();
}

export default requireUnitScope;
