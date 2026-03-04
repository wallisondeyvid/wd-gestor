export function createUnitScope({ unidadeId }) {
  if (unidadeId) {
    return {
      type: 'unit',
      unidadeId: String(unidadeId)
    };
  }

  return {
    type: 'global',
    unidadeId: null
  };
}
