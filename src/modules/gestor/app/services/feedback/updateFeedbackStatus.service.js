import { updateFeedbackStatusLeanData } from '#modules/gestor/app/data/feedback/feedbackStatusDataFacade.js';

export async function updateFeedbackStatusService(id, setData) {
	return updateFeedbackStatusLeanData(id, setData);
}

export default updateFeedbackStatusService;