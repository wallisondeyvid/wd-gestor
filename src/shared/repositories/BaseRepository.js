export class BaseRepository {
  constructor({ unitScope } = {}) {
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
