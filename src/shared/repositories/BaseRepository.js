import { assertTenantScope } from '#shared/tenant/assertTenantScope.js';
import { enforceTenantFilter } from '#shared/db/queryIsolation.js';

export class BaseRepository {
  constructor({ unitScope } = {}) {
    console.warn('[BaseRepository][constructor][before-assertTenantScope]', {
      unitScope: unitScope ?? null
    });
    this.unitScope = assertTenantScope(unitScope);
  }

  getUnitScope() {
    return this.unitScope;
  }

  isUnitScoped() {
    return this.unitScope?.type === 'unit';
  }

  getUnidadeId() {
    return this.unitScope?.unidadeId || null;
  }

  applyTenantFilter(filter = {}) {
    return enforceTenantFilter(filter, this.unitScope);
  }
}
