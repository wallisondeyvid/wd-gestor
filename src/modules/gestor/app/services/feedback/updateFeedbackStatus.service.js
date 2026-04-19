import { updateFeedbackStatusLeanData } from '#modules/gestor/app/data/feedback/feedbackStatusDataFacade.js';

export async function updateFeedbackStatusService(id, setData, options) {
	return updateFeedbackStatusLeanData(id, setData, options);
}

export default updateFeedbackStatusService;