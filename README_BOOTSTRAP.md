# Bootstrap Gestor

## Visão Geral
O módulo Gestor foi modularizado. Este documento descreve como a aplicação é inicializada agora.

## Componentes Principais
- `src/gestor/gestor-app.js`: Sub-app Express com rotas de domínio e páginas.
- `src/gestor/bootstrap/db.js`: Conexão MongoDB (isolada).
- `src/gestor/bootstrap/seed.js`: Rotinas de seed (`ensureMasterUser`, `ensureTestFuncionario`, limpeza de email incorreto).
- `src/gestor/bootstrap/startGestor.js`: Orquestra conexão + seeds + montagem do app.
- `src/gestor/server.js`: Entry point final (listener HTTP).
- `src/gestor/middlewares/requireLogin.js`: Middleware único de autenticação de sessão.
- `src/gestor/middlewares/requireRole.js`: Autorização baseada em roles.
- `src/gestor/controllers/*`: Controllers API e pages.
- `src/gestor/routes/*`: Routers correspondentes.

## Fluxo de Inicialização
1. Carrega variáveis de ambiente (`dotenv`).
2. Chama `startGestor()`:
   - Conecta Mongo via `connectMongo()`.
   - Executa seeds (`runSeeds()`): garante usuário master, funcionário e limpeza de email errado.
   - Anexa o sub-app Gestor ao Express raiz.
3. Sobe o servidor HTTP (`server.js`).

## Variáveis de Ambiente Necessárias
| Nome | Descrição | Obrigatório |
|------|-----------|-------------|
| `MONGODB_URI` | URI de conexão MongoDB | Sim |
| `PORT` | Porta HTTP (default 3001) | Não |

## Scripts
```bash
npm start          # Inicia servidor Gestor
npm test           # Roda suíte de testes (node:test)
```

## Testes
Cobrem:
- Helpers de resposta
- Autorização (`requireRole`)
- Administração de usuários (toggle/update/delete)
- Funcionários (delete)
- IBGE dataset
- Views básicas (render)
- Middleware `requireLogin`

## Padrões de Resposta API
Todas as novas APIs seguem envelope `{ success, data? , error?, code? }` definido em `apiResponse.js`.

## Próximos Passos (Opcional)
- Código legado em `src/gestor-app.js` foi removido. Use `src/start.js`.
- Adicionar testes de integração HTTP (ex: supertest) sobre `server.js`.
- Centralizar utilidades (ex: formatação de CNPJ) em `src/gestor/utils/`.

## Legacy
O antigo monólito (`src/gestor-app.js`) foi removido; `src/legacy/gestor-app.legacy.js` permanece apenas como nota histórica sem conteúdo funcional.
Todo o código funcional atual reside em `src/gestor/*`.
Utilidades críticas migradas:
- CNPJ: `src/gestor/utils/cnpj.js` com `formatarCnpj`, `validarCnpj` (testado em `tests/cnpjUtil.test.js`).
Após estabilização final recomenda-se remover o arquivo legacy para evitar confusão.

## Troubleshooting
| Sintoma | Possível Causa | Ação |
|---------|----------------|------|
| Servidor encerra ao iniciar | `MONGODB_URI` ausente | Definir no `.env` |
| Usuário master não existe | Seeds não rodaram | Ver logs de `[SEED]` |
| Código IBGE vazio | Cidade/UF não normalizados | Ver normalização em `miscApiController` |

---
Documentação gerada automaticamente como parte da refatoração de bootstrap (2025).