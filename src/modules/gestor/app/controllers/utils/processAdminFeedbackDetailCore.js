function sanitizeRespostaValue(value) {
	if (value == null) return '';
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	if (typeof value === 'object') {
		const maybe = value.texto || value.resposta || value.message || value.mensagem || value.body || value.value || value.content;
		if (typeof maybe === 'string') return maybe;
		return '';
	}
	return String(value);
}

export async function processAdminFeedbackDetailCore({ feedback }) {
	if (!feedback || typeof feedback !== 'object') return { feedback };

	const nextFeedback = { ...feedback };
	if ('resposta' in nextFeedback) nextFeedback.resposta = sanitizeRespostaValue(nextFeedback.resposta);

	return { feedback: nextFeedback };
}