# GET /gestor/api/usuario - contrato runtime base

## Escopo
- Microcorte focal apenas do contrato runtime base de `GET /gestor/api/usuario`.
- Sem edição de produção.
- Sem reabrir a projeção rica de auth-context já coberta por `tests/gestor-auth-user-endpoint-context.test.js`.

## Rota real
- Mount Gestor: `userApiRouter` em `src/modules/gestor/app/gestor-app.js`.
- Wrapper local: `src/modules/gestor/app/routes/userApi.js`.
- Rota canônica compartilhada: `router.get('/api/usuario', requireLogin, obterUsuarioAtual);` em `src/shared/routes/userApi.js`.
- Owner real: `obterUsuarioAtual` em `src/modules/gestor/app/controllers/userController.js`.

## Lacuna que existia
- A suíte existente congelava cenários de payload legado, auth-context enriquecido e pending selection.
- Ainda faltava uma prova focal e mínima do contrato base do owner para os ramos 401, 404 e envelope base sem enriquecimento.
- O fallback id -> e-mail do owner ainda não estava explicitamente caracterizado como branch interna de compatibilidade controlada, distinta do contrato público do endpoint montado.

## Prova executável adicionada
- Arquivo: `tests/gestor-auth-user-endpoint-runtime-contract.test.js`
- Execução isolada: `node --test .\\tests\\gestor-auth-user-endpoint-runtime-contract.test.js`
- Resultado: 4 testes passando.

## Comportamento agora congelado localmente
1. Responde `401` com `{ success:false, error:'Não autenticado', code:'UNAUTHORIZED' }` quando `req.user` está ausente.
2. Responde `401` com `{ success:false, error:'Sessão inválida', code:'UNAUTHORIZED' }` quando `req.session.user.id` não é um ObjectId válido.
3. No corredor montado real, resolve o perfil por `findUserByIdForProfile({ unitScope, userId })` usando `req.session.user.id` como fonte autoritativa; se esse lookup falha, responde `404` com `{ success:false, error:'Usuário não encontrado', code:'NOT_FOUND' }` sem promover o fallback por e-mail a winner runtime do endpoint.
4. No caminho feliz base, com a flag de auth-context desligada, retorna somente o envelope mínimo do perfil já consolidado (`id`, `nome`, `email`, `role`, `isMaster`, `unidade_*`, `funcionario_id`, `foto`, `cpf`, `telefone`) sem revalidar projeções ricas.

## Limite deliberado do microcorte
- Este checkpoint não substitui `tests/gestor-auth-user-endpoint-context.test.js`.
- Campos extras de auth-context, activeContext e pending selection continuam congelados somente na suíte contextual existente.
- Este checkpoint não promove o fallback id -> e-mail a requisito funcional público do endpoint montado; esse fallback permanece apenas como compatibilidade secundária para chamadas internas sem `sessionUserId` autoritativo.