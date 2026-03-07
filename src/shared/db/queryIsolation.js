export function enforceTenantFilter(filter = {}, unitScope) {
  if (!unitScope || unitScope.type !== 'unit') {
    throw new Error('[QUERY_ISOLATION] query without tenant scope');
  }

  if (!filter.unidadeId) {
    filter.unidadeId = unitScope.unidadeId;
  }

  return filter;
}

export default enforceTenantFilter;
