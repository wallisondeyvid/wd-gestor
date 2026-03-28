
import {
  inspectUnitProvisioning as inspectUnitProvisioningUseCase,
} from '#modules/gestor/app/usecases/unit-provisioning/UnitProvisioningService.js';

import { listUnitProvisioningEventsService } from './listUnitProvisioningEventsService.js';

export {
	ensureUnitProvisioned,
	isUnitProvisioningValidationError,
	retryUnitProvisioning,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

export async function inspectUnitProvisioning(input) {
	return inspectUnitProvisioningUseCase(input);
}

// Redefine a função para delegar ao novo service
export async function listUnitProvisioningAuditEvents(input) {
  return listUnitProvisioningEventsService(input);
}
