// Template compartilhado de redefinição de senha
// Retorna objeto { html, text }
export function resetPasswordTemplate(userName, resetLink, moduloLabel='WD Gestor') {
  const safeName = userName || 'Usuário';
  const product = moduloLabel;
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8" />
<title>Redefinição de Senha - ${product}</title></head><body style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#222;">
  <p>Olá <strong>${safeName}</strong>,</p>
  <p>Recebemos uma solicitação para redefinir sua senha no módulo <strong>${product}</strong>.</p>
  <p style="margin:24px 0;"><a href="${resetLink}" style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Redefinir Senha</a></p>
  <p>Se o botão não funcionar copie e cole este link no navegador:</p>
  <p><a href="${resetLink}" style="color:#2563eb;word-break:break-all;">${resetLink}</a></p>
  <hr style="margin:32px 0;border:none;border-top:1px solid #eee;" />
  <p style="font-size:12px;color:#666;">Se você não solicitou a alteração, ignore este e-mail. O link expira em 30 minutos.</p>
</body></html>`;
  const text = `Olá ${safeName},\n\nRedefina sua senha (${product}): ${resetLink}\nO link expira em 30 minutos.\nSe não solicitou, ignore.\n`;
  return { html, text };
}
export default resetPasswordTemplate;
