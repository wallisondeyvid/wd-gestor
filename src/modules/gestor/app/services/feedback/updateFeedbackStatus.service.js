import { createUnitScope } from '#shared/unitScope.js';
import { findFeedbackByIdAndUpdateSetNewLeanRepo } from '#modules/gestor/app/repositories/FeedbackReadRepository.js';

const GLOBAL_SCOPE = createUnitScope({});

export async function updateFeedbackStatusService(id, setData) {
	return findFeedbackByIdAndUpdateSetNewLeanRepo({
		unitScope: GLOBAL_SCOPE,
		id,
		setData,
	});
}

export default updateFeedbackStatusService;