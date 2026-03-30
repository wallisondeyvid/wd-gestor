const ALLOWED_FEEDBACK_STATUSES = new Set([
	'novo',
	'respondido',
	'aberto',
	'em_andamento',
	'resolvido',
	'cancelado',
]);

const ALLOWED_FEEDBACK_TYPES = new Set([
	'sugestao',
	'erro',
	'elogio',
	'outro',
]);

export async function processAdminFeedbackListFilterCore({
	q,
	status,
	tipo,
	normalizeStatus,
	normalizeTipo,
}) {
	const filter = {};

	if (status) {
		const normalizedStatus = normalizeStatus(status);
		if (!ALLOWED_FEEDBACK_STATUSES.has(normalizedStatus)) return { error: 'invalid_status' };
		filter.status = normalizedStatus;
	}

	if (tipo) {
		const normalizedTipo = normalizeTipo(tipo);
		if (!ALLOWED_FEEDBACK_TYPES.has(normalizedTipo)) return { error: 'invalid_tipo' };
		filter.tipo = normalizedTipo;
	}

	if (q) {
		const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
		filter.$or = [
			{ mensagem: rx },
			{ resposta: rx },
			{ 'criadoPor.email': rx },
			{ 'criadoPor.nome': rx },
		];
	}

	return { filter };
}