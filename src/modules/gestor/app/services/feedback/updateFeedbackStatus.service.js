import { findFeedbackByIdAndUpdateSetNewLean } from '#modules/gestor/app/services/apiDbBridgeService.js';

export async function updateFeedbackStatusService(id, setData) {
	return findFeedbackByIdAndUpdateSetNewLean(id, setData);
}

export default updateFeedbackStatusService;