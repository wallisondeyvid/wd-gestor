export async function processCreateFeedbackCore({
	mensagem,
	tipo,
	rawModulo,
	contexto,
	bodyUrl,
	bodyTimezone,
	bodyUserAgent,
	referer,
	headerUserAgent,
	scopedUnitId,
	user,
	inferModuloFromUrl,
	createFeedback,
}) {
	const ctx = contexto && typeof contexto === 'object' ? contexto : null;
	const ctxUrl = String((ctx && (ctx.url || ctx.path)) || bodyUrl || '').trim();
	const ctxTz = String((ctx && (ctx.timezone || ctx.tz)) || bodyTimezone || '').trim();
	const ctxUa = String((ctx && (ctx.user_agent || ctx.userAgent)) || bodyUserAgent || '').trim();
	const inferredModulo = String(rawModulo || '').trim() || inferModuloFromUrl(ctxUrl) || inferModuloFromUrl(referer);

	return createFeedback({
		tipo,
		status: 'novo',
		mensagem,
		criadoPor: {
			userId: user?._id || user?.id || null,
			email: user?.email || '',
			nome: user?.nome || '',
			role: user?.role || '',
		},
		origem: {
			modulo: String(inferredModulo || '').trim(),
			path: String(ctxUrl || '').trim(),
			userAgent: String(ctxUa || headerUserAgent || '').trim(),
			timezone: String(ctxTz || '').trim(),
		},
	}, {
		scopedUnitId,
	});
}