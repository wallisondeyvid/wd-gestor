export class BaseRepository {
  constructor({ unitScope } = {}) {
    const isMultiTenant = String(process.env.WDG_MULTI_TENANT || '').trim() === '1';

    if (isMultiTenant) {
      const isObject = !!unitScope && typeof unitScope === 'object';
      const isEmptyObject = isObject && Object.keys(unitScope).length === 0;
      if (!isObject || isEmptyObject) {
        throw new Error('unitScope obrigatório em modo multi-tenant');
      }
    }

    this.unitScope = unitScope || { type: 'global', unidadeId: null };
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
}
