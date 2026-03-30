const BLOB_NOT_CONFIGURED_MESSAGE = 'Blob não configurado (conecte a Store no Vercel ou defina BLOB_READ_WRITE_TOKEN/WDGESTOR_DB_DADOS_READ_WRITE_TOKEN)';

function createBlobNotConfiguredError() {
  const error = new Error(BLOB_NOT_CONFIGURED_MESSAGE);
  error.code = 'BLOB_NOT_CONFIGURED';
  return error;
}

function createFotoProcessingError(cause) {
  const error = new Error('Falha ao processar foto');
  error.code = 'FOTO_PROCESSING_FAILED';
  error.cause = cause;
  return error;
}

export async function reconcileUpdateFuncionarioFullFoto({
  reqFile,
  reqFilesFoto,
  excluirFoto,
  fotoAtual,
  funcionarioId,
  blobReady,
  uploadFuncionarioFotoToBlob,
  deleteFromBlobIfNeeded,
}) {
  const hasSingleFoto = reqFile && reqFile.fieldname === 'foto';
  const fotosMultipart = Array.isArray(reqFilesFoto) ? reqFilesFoto : [];

  if (hasSingleFoto || fotosMultipart.length > 0) {
    if (!blobReady) throw createBlobNotConfiguredError();

    const fotoUpload = hasSingleFoto ? reqFile : fotosMultipart[0];

    try {
      const fotoUrl = await uploadFuncionarioFotoToBlob(fotoUpload.buffer, funcionarioId);
      await deleteFromBlobIfNeeded(fotoAtual);
      return { mode: 'set', fotoUrl };
    } catch (error) {
      throw createFotoProcessingError(error);
    }
  }

  if (excluirFoto === 'true' && fotoAtual) {
    await deleteFromBlobIfNeeded(fotoAtual);
    return { mode: 'unset' };
  }

  return { mode: 'preserve' };
}