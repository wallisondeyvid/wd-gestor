export async function processFeedbackDeleteCleanupCore({
	id,
	fb,
	getBlobToken,
	delBlob,
	fsModule,
	pathModule,
	cwdProvider,
	logWarn,
}) {
	try {
		const blobToken = getBlobToken();
		const anexos = Array.isArray(fb?.anexos) ? fb.anexos : [];
		const urls = anexos.map((anexo) => anexo && anexo.url).filter(Boolean).map(String);
		for (const url of urls) {
			try {
				await delBlob(url, blobToken ? { token: blobToken } : undefined);
			} catch {
				// noop
			}
		}
	} catch (error) {
		logWarn('[feedbackApi] aviso: falha ao remover anexos do feedback (blob):', id, error?.message || error);
	}

	try {
		const root = pathModule.join(cwdProvider());
		const absDir = pathModule.join(root, 'public', 'uploads', 'feedback', String(id));
		if (fsModule.existsSync(absDir)) fsModule.rmSync(absDir, { recursive: true, force: true });
	} catch (error) {
		logWarn('[feedbackApi] aviso: falha ao remover anexos do feedback (fs):', id, error?.message || error);
	}
}