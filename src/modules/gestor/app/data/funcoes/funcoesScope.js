import mongoose from 'mongoose';
import { createUnitScope } from '#shared/unitScope.js';

export const GLOBAL_SCOPE = { type: 'global', unidadeId: null };

export function scopeFromUnidadeId(unidadeId) {
  const unidadeIdNorm = String(unidadeId || '').trim();
  return unidadeIdNorm && mongoose.isValidObjectId(unidadeIdNorm)
    ? createUnitScope({ unidadeId: unidadeIdNorm })
    : GLOBAL_SCOPE;
}

export function extractSingleScopedUnitId(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';

  const inValues = Array.isArray(value.$in)
    ? [...new Set(value.$in.map((item) => String(item || '').trim()).filter(Boolean))]
    : [];

  return inValues.length === 1 ? inValues[0] : '';
}

export function scopeFromFuncaoFiltro(filtro) {
  if (!filtro || typeof filtro !== 'object' || Array.isArray(filtro)) return GLOBAL_SCOPE;

  const unidadePrincipalId = extractSingleScopedUnitId(filtro.unidade_principal_id);
  return unidadePrincipalId ? scopeFromUnidadeId(unidadePrincipalId) : GLOBAL_SCOPE;
}