# Sistema de E-mail - WD Gestor

## 📧 Visão Geral

O WD Gestor agora possui um sistema completo de envio de e-mails usando SMTP da Brevo, com templates HTML responsivos e geração automática de senhas seguras.

## 🚀 Funcionalidades

### ✅ E-mail Automático na Criação de Usuários

- **Criação via Interface**: Quando um usuário é criado pela interface de usuários
- **Criação Automática**: Quando um funcionário é criado e o usuário é gerado automaticamente
- **Senha Segura**: Geração de senha alfanumérica de 8 caracteres
- **Template HTML**: E-mail responsivo com design profissional

### ✅ Rota de Teste

- **Endpoint**: `GET /dev/test-email?to=email@exemplo.com`
- **Função**: Testar configuração SMTP sem criar usuários
- **Exemplo**: `http://localhost:3006/dev/test-email?to=seu@email.com`

## 📋 Configuração

### 1. Arquivo `.env`

```ini
# Brevo SMTP
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=seu_login_smtp@brevo.com
SMTP_PASS=sua_senha_smtp

# Remetente
SMTP_FROM_NAME=WD Gestor
SMTP_FROM_EMAIL=wallisondeyvid13@gmail.com
SMTP_REPLY_TO=wallisondeyvid13@gmail.com

# App
APP_NAME=WD Gestor
APP_URL=http://localhost:3006
```

### 2. Dependências Instaladas

```bash
npm install nodemailer bcryptjs
```

## 📁 Estrutura de Arquivos

```
src/
├── lib/
│   └── mailer.js                    # Configuração Nodemailer
├── mail/
│   └── templates/
│       └── welcomePassword.js       # Template de boas-vindas
├── services/
│   └── userService.js              # Serviço de criação de usuário
└── routes/
    └── dev.js                      # Rotas de desenvolvimento
```

## 🔧 Como Funciona

### 1. Criação de Usuário com E-mail

```javascript
const { createUserAndSendPassword } = require('./services/userService');

const user = await createUserAndSendPassword({
  nome: 'João Silva',
  email: 'joao@email.com',
  role: 'user',
  unidade_id: 'unit_id',
  funcionario_id: 'func_id' // opcional
});
```

### 2. Template de E-mail

O template `welcomePassword.js` gera e-mails HTML responsivos com:

- ✅ Saudação personalizada
- ✅ Senha temporária destacada
- ✅ Link para login
- ✅ Versão texto puro (fallback)
- ✅ Design responsivo

### 3. Logs e Monitoramento

```bash
# Logs de sucesso
[USER SERVICE] E-mail de boas-vindas enviado para joao@email.com
[AUTO USER] Usuário criado automaticamente

# Logs de erro
[USER SERVICE] Falha ao enviar e-mail: Connection timeout
[MAILER] Falha ao conectar no SMTP
```

## 🧪 Testes

### Teste Básico do SMTP

```bash
# Via navegador
http://localhost:3006/dev/test-email?to=seu@email.com

# Via curl
curl "http://localhost:3006/dev/test-email?to=seu@email.com"
```

### Teste de Criação de Usuário

1. Acesse a interface de usuários
2. Crie um novo usuário
3. Verifique os logs do console
4. Confirme se o e-mail foi enviado

## 🔒 Segurança

### Senhas Geradas

- ✅ **8 caracteres alfanuméricos**
- ✅ **Maiúsculas + números**
- ✅ **Exemplo**: `A1B2C3D4`, `X9Y8Z7W6`
- ✅ **Hash bcrypt** (10 rounds)
- ✅ **Primeiro acesso obrigatório**

### Proteções Implementadas

- ✅ **Validação de e-mail único**
- ✅ **CPF único** (se informado)
- ✅ **Tentativas de reenvio** automáticas
- ✅ **Logs detalhados** para auditoria

## 🚨 Tratamento de Erros

### Quando o E-mail Falha

1. **Log de erro** é registrado
2. **Senha temporária** fica disponível no objeto `user._temp_password_plain`
3. **Usuário continua funcional** (pode fazer login)
4. **Admin pode ver a senha** nos logs para informar manualmente

### Recuperação

```javascript
// Se o e-mail falhar, a senha fica disponível aqui
if (user._temp_password_plain) {
  console.log('Senha temporária:', user._temp_password_plain);
  // Mostrar para o admin ou salvar em local seguro
}
```

## 📈 Melhorias Futuras

### Fila de E-mails
```javascript
// Para alto volume, implementar BullMQ/Redis
const Queue = require('bull');
const emailQueue = new Queue('emails', { redis: { host: '127.0.0.1', port: 6379 } });
```

### Templates Adicionais
- E-mail de recuperação de senha
- Notificações de alteração de dados
- Relatórios automáticos

### Dashboard de E-mails
- Status de entrega
- Taxa de abertura
- Logs históricos

## 🔧 Troubleshooting

### Erro: "SMTP connection failed"

```bash
# Verificar credenciais no .env
cat .env | grep SMTP

# Testar conexão manual
telnet smtp-relay.brevo.com 587
```

### Erro: "E-mail not delivered"

1. Verificar se o domínio está validado na Brevo
2. Conferir lista de remetentes autorizados
3. Verificar quota diária da Brevo

### Logs Úteis

```bash
# Verificar logs do mailer
grep "\[MAILER\]" logs/app.log

# Verificar logs de usuário
grep "\[USER SERVICE\]" logs/app.log
```

## 📞 Suporte

Para dúvidas ou problemas:

1. **Verificar logs** da aplicação
2. **Testar rota de diagnóstico** `/dev/test-email`
3. **Conferir configurações** no painel da Brevo
4. **Validar domínio** se necessário

---

**🎉 Sistema de e-mail implementado com sucesso!** Os usuários agora recebem automaticamente suas credenciais por e-mail quando criados.