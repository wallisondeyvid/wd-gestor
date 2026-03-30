function parseJsonArray(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeFacialCapturas(items) {
  return items
    .filter((item) => item && (item.hash || item.imagem))
    .map((item) => ({
      hash: String(item.hash || '').substring(0, 128),
      imagem: item.imagem && String(item.imagem).length < 500000 ? item.imagem : undefined,
      template_b64: item.template_b64 && String(item.template_b64).length < 500000 ? item.template_b64 : undefined,
      template_sha256: item.template_sha256 || undefined,
      qualidade: (item.qualidade != null && Number.isFinite(Number(item.qualidade))) ? Number(item.qualidade) : undefined,
    }));
}

function normalizeDigitaisCapturas(items) {
  return items
    .filter((item) => item && (item.hash || item.imagem))
    .map((item) => ({
      hash: String(item.hash || '').substring(0, 128),
      imagem: item.imagem && String(item.imagem).length < 500000 ? item.imagem : undefined,
      template_b64: item.template_b64 && String(item.template_b64).length < 500000 ? item.template_b64 : undefined,
      template_sha256: item.template_sha256 || undefined,
      dedo: (Number.isInteger(item.idx) && item.idx >= 0 && item.idx < 10) ? `D${item.idx + 1}` : undefined,
    }));
}

export async function reconcileUpdateFuncionarioFullBiometria({
  faceCapturasJson,
  fpCapturasJson,
  faceImagem,
  blobReady,
  funcionarioId,
  mapBiometriasFaciaisToBlob,
  parseDataUrl,
  uploadFacePreviewToBlob,
}) {
  const patch = { set: {}, unset: [] };

  if (typeof faceCapturasJson === 'string' && faceCapturasJson.length <= 500000) {
    const parsedFace = parseJsonArray(faceCapturasJson);
    if (Array.isArray(parsedFace)) {
      let normalizedFace = normalizeFacialCapturas(parsedFace);
      if (normalizedFace.length && blobReady) {
        try {
          normalizedFace = await mapBiometriasFaciaisToBlob(normalizedFace, funcionarioId);
        } catch {}
      }
      if (normalizedFace.length) patch.set.biometrias_facial = normalizedFace;
      else patch.unset.push('biometrias_facial');
    }
  }

  if (typeof fpCapturasJson === 'string' && fpCapturasJson.length <= 500000) {
    const parsedFp = parseJsonArray(fpCapturasJson);
    if (Array.isArray(parsedFp)) {
      const normalizedFp = normalizeDigitaisCapturas(parsedFp);
      if (normalizedFp.length) patch.set.biometrias_digitais = normalizedFp;
      else patch.unset.push('biometrias_digitais');
    }
  }

  if (blobReady && typeof faceImagem === 'string' && /^data:/i.test(faceImagem)) {
    try {
      const parsedFaceImagem = parseDataUrl(faceImagem);
      if (parsedFaceImagem) {
        const facePreviewUrl = await uploadFacePreviewToBlob(parsedFaceImagem.buffer, funcionarioId, 0);
        if (facePreviewUrl) patch.set.face_imagem = facePreviewUrl;
      }
    } catch {}
  }

  return patch;
}