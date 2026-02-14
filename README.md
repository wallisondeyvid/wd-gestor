# WDGestor

Sistema de gestão empresarial completo desenvolvido em Node.js com funcionalidades para gestão de funcionários, escalas, recursos e muito mais.

## 🚀 Funcionalidades

### Módulo Gestor
- **Gestão de Funcionários**: Cadastro completo com dados pessoais, contratuais e biométricos
- **Gestão de Unidades**: Organização hierárquica de filiais e departamentos
- **Gestão de Setores**: Estruturação organizacional por setores
- **Gestão de Funções**: Definição de cargos e responsabilidades
- **Gestão de Recursos**: Controle de recursos materiais e humanos
- **Sistema de Usuários**: Controle de acesso com diferentes níveis de permissão

### Módulo Escalas
- **Escalas de Trabalho**: Criação e gestão de escalas complexas
- **Turnos**: Definição flexível de turnos de trabalho
- **Equipes**: Organização de funcionários em equipes
- **Ausências**: Controle de faltas e afastamentos
- **Férias**: Gestão de períodos de férias
- **Relatórios**: Geração de relatórios detalhados

### Recursos Técnicos
- **Biometria Digital**: Integração com leitores de impressão digital
- **Biometria Facial**: Reconhecimento facial usando MediaPipe
- **Upload de Arquivos**: Sistema robusto para upload de documentos e fotos
- **API RESTful**: Interface de programação completa
- **Máscaras e Validações**: Validação avançada de dados
- **Sistema de E-mail**: Envio automático de notificações

## 🛠️ Tecnologias Utilizadas

- **Backend**: Node.js, Express.js
- **Frontend**: EJS, Bootstrap, JavaScript
- **Banco de Dados**: MongoDB (via Mongoose)
- **Autenticação**: Session-based com bcrypt
- **Upload**: Multer para processamento de arquivos
- **Biometria**: MediaPipe para reconhecimento facial
- **E-mail**: Nodemailer para envio de e-mails
- **Validação**: Joi para validação de dados
- **Logs**: Winston para sistema de logs

## 📋 Pré-requisitos

- Node.js (versão 16 ou superior)
- MongoDB
- NPM ou Yarn

## 🔧 Instalação

1. Clone o repositório:
```bash
git clone https://github.com/wallisondeyvid/wdgestor.git
cd wdgestor
```

2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente:
```bash
cp .env.example .env
```

4. Edite o arquivo `.env` com suas configurações:
```env
DB_CONNECTION_STRING=mongodb://localhost:27017/wdgestor
SESSION_SECRET=sua_chave_secreta_aqui
SMTP_HOST=seu_servidor_smtp
SMTP_PORT=587
SMTP_USER=seu_email
SMTP_PASS=sua_senha
```

5. Inicie o servidor:
```bash
npm start
```

O sistema estará disponível em `http://localhost:3000`

## 📁 Estrutura do Projeto

```
├── src/
│   ├── modules/
│   │   ├── gestor/          # Módulo principal de gestão
│   │   └── escalas/         # Módulo de escalas de trabalho
│   ├── core/                # Funcionalidades centrais
│   ├── middlewares/         # Middlewares personalizados
│   └── utils/               # Utilitários
├── public/                  # Arquivos estáticos
├── views/                   # Templates EJS
├── models/                  # Modelos de dados
├── scripts/                 # Scripts utilitários
└── tests/                   # Testes automatizados
```

## 🧪 Testes

Execute os testes com:
```bash
npm test
```

## 📚 Docs adicionais

- [README_FEEDBACK_UPLOAD.md](README_FEEDBACK_UPLOAD.md) — upload de anexos do feedback via Vercel Blob

## 📖 API Documentation

A documentação da API está disponível em `/api/docs` quando o servidor estiver rodando.

## 🤝 Contribuição

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📝 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 👨‍💻 Autor

**Wallison Deyvid**
- GitHub: [@wallisondeyvid](https://github.com/wallisondeyvid)

## 📞 Suporte

Para suporte, entre em contato através do email: [seu-email@exemplo.com]

---

⭐ Se este projeto foi útil para você, considere dar uma estrela!