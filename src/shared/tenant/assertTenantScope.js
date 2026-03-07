function isAllowGlobalEnabled() {
  const raw = String(process.env.ALLOW_GLOBAL || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on';
}

function isMultiTenantEnforced() {
  return String(process.env.WDG_MULTI_TENANT || '').trim() === '1';
}

function logTenantGuardBlock(reason, unitScope) {
  console.warn('TENANT_GUARD_BLOCK', {
    reason,
    type: unitScope?.type ?? null,
    unidadeId: unitScope?.unidadeId ?? null,
    allowGlobal: isAllowGlobalEnabled(),
  });
}

export function assertTenantScope(unitScope) {
  const enforce = isMultiTenantEnforced();
  const isObject = !!unitScope && typeof unitScope === 'object';
  const isEmptyObject = isObject && Object.keys(unitScope).length === 0;

  if (!isObject || isEmptyObject) {
    if (!enforce) {
      return { type: 'global', unidadeId: null };
    }

    logTenantGuardBlock('MISSING_UNIT_SCOPE', unitScope);
    throw new Error('unitScope obrigatório em modo multi-tenant');
  }

  const scopeType = String(unitScope.type || '').trim().toLowerCase();

  if (scopeType === 'unit') {
    return unitScope;
  }

  if (scopeType === 'global') {
    if (!enforce || isAllowGlobalEnabled()) {
      return unitScope;
    }

    logTenantGuardBlock('GLOBAL_SCOPE_NOT_ALLOWED', unitScope);
    throw new Error('global unitScope is not allowed');
  }

  logTenantGuardBlock('INVALID_SCOPE_TYPE', unitScope);
  throw new Error('unitScope.type must be unit');
}

export default assertTenantScope;
