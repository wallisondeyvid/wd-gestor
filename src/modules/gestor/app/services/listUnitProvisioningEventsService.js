// Service mínimo: leitura semântica dos eventos de provisioning
// Entrada: { unidadeId, limit, scope, moduleKey, operation, status, before }
// Saída: array de eventos (já normalizados)
import { listUnitProvisioningAuditEvents } from './UnitProvisioningService.js';

export async function listUnitProvisioningEventsService({ unidadeId, limit, scope, moduleKey, operation, status, before }) {
  // Chama o data access, sem paginação, sem envelope, sem manipulação de erro HTTP
  return await listUnitProvisioningAuditEvents({
    unidadeId,
    limit,
    scope,
    moduleKey,
    operation,
    status,
    before,
  });
}
