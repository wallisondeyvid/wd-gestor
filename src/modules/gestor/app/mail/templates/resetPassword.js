// Módulo Gestor - template de reset de senha
export function resetPasswordTemplate(userName, resetLink) {
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8" /><title>Redefinição de Senha - WD Gestor</title></head><body><p>Olá <strong>${userName}</strong>,</p><p>Use o link para redefinir sua senha:</p><p><a href="${resetLink}">${resetLink}</a></p><p>Ignorar se não solicitado.</p></body></html>`;
  const text = `Olá ${userName},\n\nRedefina sua senha: ${resetLink}\nSe não solicitou, ignore.\n`;
  return { html, text };
}
export default resetPasswordTemplate;
