// src/modules/gestor/app/usecases/unit-provisioning/orchestrateUnitProvisioning.js
export async function orchestrateUnitProvisioning({ unidadeId, is_principal, subunidade, modulosAcessiveis, resolveTipoUnidadeProvisionada, ensureUnitProvisioned }) {
  // resolveTipoUnidadeProvisionada e ensureUnitProvisioned são injetados para facilitar teste e evitar dependência circular
  const tipo = resolveTipoUnidadeProvisionada({ is_principal, subunidade });
  await ensureUnitProvisioned({
    unidadeId,
    tipo,
    modulosHabilitados: modulosAcessiveis,
  });
}
