import {
	inspectUnitProvisioning as inspectUnitProvisioningUseCase,
	listUnitProvisioningAuditEvents as listUnitProvisioningAuditEventsUseCase,
} from '#modules/gestor/app/usecases/unit-provisioning/UnitProvisioningService.js';

export {
	ensureUnitProvisioned,
	isUnitProvisioningValidationError,
	retryUnitProvisioning,
} from '#modules/gestor/app/services/apiDbBridgeService.js';

export async function inspectUnitProvisioning(input) {
	return inspectUnitProvisioningUseCase(input);
}

export async function listUnitProvisioningAuditEvents(input) {
	return listUnitProvisioningAuditEventsUseCase(input);
}
