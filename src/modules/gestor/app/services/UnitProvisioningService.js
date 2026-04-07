
import {
	inspectUnitProvisioning as inspectUnitProvisioningBridge,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

import { listUnitProvisioningEventsService } from './listUnitProvisioningEventsService.js';

export {
	ensureUnitProvisioned,
	isUnitProvisioningValidationError,
	retryUnitProvisioning,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

export async function inspectUnitProvisioning(input) {
	return inspectUnitProvisioningBridge(input);
}

// Redefine a função para delegar ao novo service
export async function listUnitProvisioningAuditEvents(input) {
  return listUnitProvisioningEventsService(input);
}
