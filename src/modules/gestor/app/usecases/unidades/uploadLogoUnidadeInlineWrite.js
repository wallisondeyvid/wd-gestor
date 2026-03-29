export async function uploadLogoUnidadeInlineWrite({
  unidade,
  buffer,
  processarEEnviarParaBlob,
  removeBlobLogo,
  saveUnidade,
}) {
  const uploaded = await processarEEnviarParaBlob(buffer, { keyPrefix: `unidades/${unidade._id}` });

  try {
    if (unidade.logo && /^https?:\/\/.*blob\.vercel-storage\.com\//i.test(unidade.logo)) {
      await removeBlobLogo(unidade.logo, uploaded.token ? { token: uploaded.token } : undefined);
    }
  } catch {}

  unidade.logo = uploaded.url;
  await saveUnidade(unidade);

  return { logo: unidade.logo };
}