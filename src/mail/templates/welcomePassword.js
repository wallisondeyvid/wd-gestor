function welcomePassword({ nome, email, senha, appName, appUrl }) {
  const title = `Bem-vindo(a) ao ${appName}`;
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:auto">
    <h2>${title}</h2>
    <p>Olá, <strong>${nome || email}</strong>!</p>
    <p>Sua conta foi criada. Use a senha provisória abaixo para acessar e trocá-la no primeiro login:</p>
    <p style="font-size:18px"><strong>Senha provisória:</strong>
      <span style="font-family:monospace;background:#f4f4f4;padding:6px 10px;border-radius:6px;">
        ${senha}
      </span>
    </p>
    <p><a href="${appUrl}/gestor/login" style="display:inline-block;background:#16a34a;color:#fff;
       padding:10px 16px;border-radius:8px;text-decoration:none">Entrar agora</a></p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
    <p style="color:#666;font-size:12px">Se você não reconhece este e-mail, ignore.</p>
  </div>`;
  const text =
    `${title}\n\n` +
    `Olá, ${nome || email}!\n\n` +
    `Senha provisória: ${senha}\n` +
    `Acesse ${appUrl}/gestor/login e troque sua senha no primeiro login.\n`;
  return { html, text };
}
export { welcomePassword };