export async function processFeedbackUploadStorageCore({
	baseUrl,
	feedbackId,
	file,
	safeFileName,
	safeExtFromFile,
	shouldUseBlobStorage,
	getBlobToken,
	putBlob,
	fsModule,
	pathModule,
	cwdProvider,
	isBlobNotConfiguredError,
	isVercel,
}) {
	const original = safeFileName(file?.originalname);
	const ext = safeExtFromFile({ originalName: original, mimeType: file?.mimetype });
	const stamped = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}${ext}`;

	if (shouldUseBlobStorage()) {
		const blobToken = getBlobToken();
		const key = `feedback/${String(feedbackId)}/${stamped}`;
		const putOptions = {
			access: 'public',
			contentType: String(file?.mimetype || 'application/octet-stream'),
			cacheControl: 'public, max-age=31536000, immutable',
			...(blobToken ? { token: blobToken } : {}),
		};

		try {
			const { url } = await putBlob(key, file.buffer, putOptions);
			if (url) {
				return { url: String(url), storedIn: 'blob', originalName: original, stampedName: stamped };
			}
		} catch (err) {
			if (isVercel) {
				const error = new Error('BLOB_UPLOAD_FAILED');
				error.code = isBlobNotConfiguredError(err) ? 'BLOB_NOT_CONFIGURED' : 'BLOB_UPLOAD_FAILED';
				error.cause = err;
				throw error;
			}
		}
	}

	const root = pathModule.join(cwdProvider());
	const relDir = pathModule.join('public', 'uploads', 'feedback', String(feedbackId));
	const absDir = pathModule.join(root, relDir);
	fsModule.mkdirSync(absDir, { recursive: true });
	const absFile = pathModule.join(absDir, stamped);
	fsModule.writeFileSync(absFile, file.buffer);

	const url = `${baseUrl}/uploads/feedback/${encodeURIComponent(String(feedbackId))}/${encodeURIComponent(stamped)}`;
    return { url: String(url), storedIn: 'fs', originalName: original, stampedName: stamped };
}