import { GLOBAL_SCOPE, scopeFromUnidadeId } from '#modules/gestor/app/data/funcoes/funcoesScope.js';
import {
  findUnidadeUserBaseLeanRepo,
  findUnidadesByCondLeanRepo,
} from '#modules/gestor/app/repositories/UnidadeReadRepository.js';

function extractScopedClusterAnchorFromUnidadesCond(cond) {
  if (!cond || typeof cond !== 'object' || Array.isArray(cond)) return '';

  const clauses = Array.isArray(cond.$or) ? cond.$or : null;
  if (!clauses || clauses.length !== 3) return '';

  const allowedKeys = new Set(['_id', 'unidade_principal_id', 'matriz_id']);
  const matchedKeys = new Set();
  const anchors = new Set();

  for (const clause of clauses) {
    if (!clause || typeof clause !== 'object' || Array.isArray(clause)) return '';

    const entries = Object.entries(clause)
      .map(([key, value]) => [key, String(value || '').trim()])
      .filter(([, value]) => value);

    if (entries.length !== 1) return '';

    const [key, value] = entries[0];
    if (!allowedKeys.has(key)) return '';

    matchedKeys.add(key);
    anchors.add(value);
  }

  if (matchedKeys.size !== 3 || anchors.size !== 1) return '';
  return [...anchors][0];
}

export async function findUnidadeUserBaseLeanData(id) {
  return findUnidadeUserBaseLeanRepo({ unitScope: scopeFromUnidadeId(id), id });
}

export async function findUnidadesByCondLeanData(cond) {
  const anchor = extractScopedClusterAnchorFromUnidadesCond(cond);

  return findUnidadesByCondLeanRepo({
    unitScope: anchor ? scopeFromUnidadeId(anchor) : GLOBAL_SCOPE,
    cond,
  });
}