export async function processUpdateFeedbackRespostaCore({
	id,
	resposta,
	findFeedbackByIdAndUpdateSetNewLean,
}) {
	const set = { resposta };
	if (resposta) set.status = 'respondido';
	return findFeedbackByIdAndUpdateSetNewLean(id, set);
}