export async function processMyFeedbackListFilterCore({ currentUser }) {
	const me = currentUser?._id || currentUser?.id || null;
	const filter = me ? { 'criadoPor.userId': me } : { 'criadoPor.email': currentUser?.email || '' };

	return { filter };
}