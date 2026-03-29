export async function executeToggleAccessCore({
  unitIds,
  activate,
  role,
  canAccessUnitId,
  findUnidadesPrincipaisByIds,
  updateManyUnidadesAccessByIds,
}) {
  const accessChecks = await Promise.all(unitIds.map((unitId) => canAccessUnitId(unitId)));
  if (accessChecks.some((canAccess) => !canAccess)) {
    return { kind: 'bad_request', message: 'Acesso à unidade não autorizado.' };
  }

  if (role === 'diretor') {
    const unidadesPrincipais = await findUnidadesPrincipaisByIds(unitIds);
    if (unidadesPrincipais.length > 0) {
      return { kind: 'bad_request', message: 'Diretores não podem alterar o acesso de unidades principais.' };
    }
  }

  const result = await updateManyUnidadesAccessByIds(unitIds, activate);
  if (result.modifiedCount === 0) {
    return { kind: 'bad_request', message: 'Nenhuma unidade atualizada.' };
  }

  return { kind: 'ok' };
}