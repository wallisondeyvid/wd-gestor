export async function getSetoresByUnitCore({
  effectiveUnitId,
  findSetoresByUnidadeIdPopulateLean,
}) {
  return findSetoresByUnidadeIdPopulateLean(effectiveUnitId);
}

export default getSetoresByUnitCore;