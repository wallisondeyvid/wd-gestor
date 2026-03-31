export async function processMyFeedbackDetailOwnershipCore({ feedback, currentUser }) {
	const creator = feedback?.criadoPor?.userId ? String(feedback.criadoPor.userId) : '';
	const me = currentUser?._id || currentUser?.id;

	if (creator && me && String(me) !== creator) return { error: 'forbidden' };

	return { feedback };
}