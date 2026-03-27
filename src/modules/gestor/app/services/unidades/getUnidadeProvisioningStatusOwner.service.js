import { findUnidadeById } from '#modules/gestor/app/services/apiDbBridgeService.js';
import { inspectUnitProvisioning } from '#modules/gestor/app/services/UnitProvisioningService.js';

export async function getUnidadeProvisioningStatusOwnerService({ unidadeId, canAccessUnidade } = {}) {
  const normalizedUnidadeId = String(unidadeId || '').trim();
  if (!normalizedUnidadeId) {
    return { kind: 'bad_request', message: 'ID da unidade e obrigatorio.' };
  }

  const unidade = await findUnidadeById(normalizedUnidadeId);
  if (!unidade) {
    return { kind: 'not_found', message: 'Unidade nao encontrada' };
  }

  const canAccess = await canAccessUnidade?.(unidade._id);
  if (!canAccess) {
    return { kind: 'forbidden', message: 'Acesso a unidade nao autorizado' };
  }

  const snapshot = await inspectUnitProvisioning({ unidadeId: unidade._id });
  return { kind: 'ok', snapshot };
}

export default {
  getUnidadeProvisioningStatusOwnerService,
};