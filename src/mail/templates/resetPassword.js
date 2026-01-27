const resetPasswordTemplate = (userName, resetLink) => {
  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Redefinição de Senha - WD Gestor</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            background-color: #f4f4f4;
            padding: 20px;
        }
        .container {
            background-color: #ffffff;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .logo {
            font-size: 24px;
            font-weight: bold;
            color: #007bff;
            margin-bottom: 10px;
        }
        .title {
            font-size: 20px;
            color: #333;
            margin-bottom: 20px;
        }
        .content {
            margin-bottom: 30px;
        }
        .reset-button {
            display: inline-block;
            background-color: #007bff;
            color: #ffffff;
            text-decoration: none;
            padding: 12px 30px;
            border-radius: 5px;
            font-weight: bold;
            text-align: center;
            margin: 20px 0;
        }
        .reset-button:hover {
            background-color: #0056b3;
        }
        .warning {
            background-color: #fff3cd;
            border: 1px solid #ffeaa7;
            color: #856404;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
        }
        .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            font-size: 12px;
            color: #666;
            text-align: center;
        }
        .link-text {
            word-break: break-all;
            background-color: #f8f9fa;
            padding: 10px;
            border-radius: 5px;
            font-family: monospace;
            font-size: 12px;
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">WD Gestor</div>
            <h1 class="title">Redefinição de Senha</h1>
        </div>

        <div class="content">
            <p>Olá <strong>${userName}</strong>,</p>

            <p>Recebemos uma solicitação para redefinir a senha da sua conta no WD Gestor.</p>

            <p>Para redefinir sua senha, clique no botão abaixo:</p>

            <div style="text-align: center;">
                <a href="${resetLink}" class="reset-button">Redefinir Minha Senha</a>
            </div>

            <div class="warning">
                <strong>Atenção:</strong> Este link é válido por 24 horas e pode ser usado apenas uma vez.
                Se você não solicitou esta redefinição, ignore este email.
            </div>

            <p>Se o botão não funcionar, copie e cole o link abaixo no seu navegador:</p>
            <div class="link-text">${resetLink}</div>

            <p>Atenciosamente,<br>
            Equipe WD Gestor</p>
        </div>

        <div class="footer">
            <p>Este é um email automático, por favor não responda.</p>
            <p>© 2024 WD Gestor. Todos os direitos reservados.</p>
        </div>
    </div>
</body>
</html>`;

  const text = `
Olá ${userName},

Recebemos uma solicitação para redefinir a senha da sua conta no WD Gestor.

Para redefinir sua senha, acesse o link abaixo:
${resetLink}

ATENÇÃO: Este link é válido por 24 horas e pode ser usado apenas uma vez.
Se você não solicitou esta redefinição, ignore este email.

Atenciosamente,
Equipe WD Gestor

---
Este é um email automático, por favor não responda.
© 2024 WD Gestor. Todos os direitos reservados.
`;

  return { html, text };
};

export { resetPasswordTemplate };