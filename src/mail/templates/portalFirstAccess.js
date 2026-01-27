const formatCnpj = (value = '') => {
  const digits = String(value || '').replace(/\D/g, '').padStart(14, '0');
  if (digits.length !== 14) return String(value || '');
  return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)}/${digits.slice(8,12)}-${digits.slice(12)}`;
};

export function portalFirstAccessEmail({
  nome,
  email,
  senhaProvisoria,
  portalBaseUrl,
  firstAccessUrl,
  unidadeNome,
  unidadeCodigo,
  unidadeCnpj,
  unidadeLogoUrl,
  validadeDescricao
}) {
  const displayName = nome || email || 'Morador';
  const condoLine = [unidadeNome || 'Seu Condomínio', unidadeCodigo ? `(${unidadeCodigo})` : '']
    .filter(Boolean)
    .join(' ');
  const cnpjLine = unidadeCnpj ? formatCnpj(unidadeCnpj) : '';
  const validadeLabel = validadeDescricao || 'por tempo limitado';
  const defaultPortalBase = 'https://wdgestor.app/portal-morador';
  const safePortalUrl = (portalBaseUrl && portalBaseUrl.trim() ? portalBaseUrl : defaultPortalBase).replace(/\/$/, '');
  const fallbackLogoUrl = `${safePortalUrl}/images/logoWDGestor.png`;
  const finalLogoUrl = (unidadeLogoUrl && unidadeLogoUrl.trim()) || fallbackLogoUrl;
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:auto;background:#f7fafc;padding:32px;border-radius:18px;border:1px solid #e2e8f0;">
    <div style="background:#fff;padding:32px;border-radius:16px;box-shadow:0 18px 35px rgba(15,23,42,.08);">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
        <img src="${finalLogoUrl}" alt="Logo do condomínio" style="max-height:56px;max-width:120px;object-fit:contain;"/>
        <div>
          <p style="margin:0;color:#64748b;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Portal do Morador</p>
          <h2 style="margin:0;color:#0f172a;font-size:20px;">${condoLine}</h2>
        </div>
      </div>
      <p style="color:#0f172a;font-size:15px;line-height:1.6;">Olá, <strong>${displayName}</strong>!</p>
      <p style="color:#0f172a;font-size:15px;line-height:1.6;">Criamos um acesso exclusivo para você no Portal do Morador. Use os dados abaixo para completar o primeiro acesso e definir sua senha definitiva.</p>
      ${cnpjLine ? `<p style="margin:12px 0 24px;color:#475569;font-size:14px;">CNPJ do condomínio: <strong>${cnpjLine}</strong></p>` : ''}
      <div style="background:#0f172a;color:#fff;padding:20px;border-radius:14px;margin:24px 0;">
        <p style="margin:0 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,.7);">Senha provisória</p>
        <p style="margin:0;font-size:22px;letter-spacing:1px;font-family:'Courier New',monospace;">${senhaProvisoria}</p>
        <p style="margin:16px 0 0;font-size:13px;color:rgba(255,255,255,.75);">Válida ${validadeLabel}.</p>
      </div>
      <a href="${firstAccessUrl}" style="display:inline-block;background:#0d9488;color:#fff;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:600;">Ir para o primeiro acesso</a>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin-top:18px;">Se preferir, copie e cole este link em seu navegador:<br><a href="${firstAccessUrl}" style="color:#0d4fbf;text-decoration:none;">${firstAccessUrl}</a></p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0" />
      <p style="color:#94a3b8;font-size:13px;line-height:1.5;">Após concluir o primeiro acesso em ${safePortalUrl}/primeiroacesso, utilize o portal normalmente em <a href="${safePortalUrl}/login" style="color:#0d4fbf;text-decoration:none;">${safePortalUrl}/login</a>.</p>
      <p style="color:#94a3b8;font-size:12px;">Se você não solicitou este acesso, ignore esta mensagem.</p>
    </div>
  </div>`;

  const textLines = [
    `Portal do Morador - ${condoLine}`,
    '',
    `Olá, ${displayName}!`,
    '',
    'Use a senha provisória abaixo para completar o primeiro acesso:',
    `Senha provisória: ${senhaProvisoria}`,
    unidadeCnpj ? `CNPJ do condomínio: ${cnpjLine}` : null,
    `Primeiro acesso: ${firstAccessUrl}`,
    `Portal: ${safePortalUrl}/login`,
    '',
    'Após o primeiro acesso, defina uma nova senha segura.',
    'Caso não tenha solicitado, ignore esta mensagem.'
  ].filter(Boolean);
  const text = textLines.join('\n');

  return { html, text };
}
