## GET /gestor/api/usuario

Status: checkpointado
Classificacao: MICRO_PASSO_SEGURO consumido

## Objetivo encerrado

- Consolidar documentalmente o contrato minimo real de GET /gestor/api/usuario no caminho montado atual do app.
- Encerrar o micro-passo sem patch de producao, sem novo teste adicional e sem abrir auth-context amplo ou outros endpoints de usuario.

## Caminho canonico

- Caminho canonico: GET /gestor/api/usuario.
- Mount real: src/modules/gestor/app/gestor-app.js monta userApiRouter no app do Gestor.
- Rota viva montada: src/shared/routes/userApi.js -> router.get('/api/usuario', requireLogin, obterUsuarioAtual).
- Handler vivo: src/modules/gestor/app/controllers/userController.js -> obterUsuarioAtual.
- Middleware real da rota: requireLogin.
- A rota explicita de /api/usuario permanece registrada antes de router.use('/api', requireLogin) no mesmo router compartilhado.

## Estado atual

- O endpoint publico permanece exposto pelo mount real de userApiRouter no app do Gestor.
- O handler efetivo do caminho publico permanece em src/modules/gestor/app/controllers/userController.js -> obterUsuarioAtual.
- O endpoint preserva payload legado quando a flag do AuthContext Resolver esta desligada.
- O endpoint acrescenta campos de AuthContext no payload quando a flag esta ligada e existe contexto completo resolvido.
- Durante selecao pendente, o endpoint continua acessivel e expoe o estado pendente no proprio payload, sem fingir activeContext.
- Quando a sessao nao possui id valido, o endpoint retorna 401.
- O fallback id -> e-mail existente no owner interno nao aparece materializado como comportamento publico observado nas suites do caminho montado real deste endpoint.
- O caminho montado real passa a tratar `req.session.user.id` + escopo efetivo como fonte autoritativa do perfil atual.
- Nao houve patch de producao.

## Contrato minimo agora congelado

- Payload legado preservado: 200 com success=true, data objeto contendo id, email, role e isMaster, sem campos extras de AuthContext quando a flag esta desligada.
- Contexto completo resolvido: 200 com success=true e data objeto contendo os campos legados mais authenticated, source, globalRole, effectiveRole, needsUnitSelection, membershipCount, activeContext e membershipsSummary.
- Selecao pendente: 200 com success=true, data.needsUnitSelection=true, data.effectiveRole=null, data.activeContext=null e membershipsSummary preenchido.
- Sessao sem id valido: 401 no caminho publico do endpoint.

## Cobertura validada

- Arquivo de teste: tests/gestor-auth-user-endpoint-context.test.js.
- Cenarios ja cobertos no caminho montado real:
  - GET /gestor/api/usuario mantem o payload legado quando a flag esta desligada.
  - GET /gestor/api/usuario acrescenta campos de AuthContext com contexto completo.
  - GET /gestor/api/usuario expoe selecao pendente sem fingir activeContext.
- Arquivo de teste adicional: tests/usuarioAtual.session-id.test.js.
  - GET /gestor/api/usuario retorna 401 quando sessao nao possui id valido.
- Guardrail de middleware relacionado: tests/requireLogin.test.js.
  - requireLogin preserva /api/usuario durante selecao pendente.

## Conclusao

- GET /gestor/api/usuario ja tem contrato funcional minimo suficientemente congelado por testes existentes no caminho montado real.
- O contrato publico congelado do endpoint nao depende de prova observavel do fallback id -> e-mail; esse ramo permanece apenas como compatibilidade controlada interna.
- O winner runtime do endpoint montado real fica endurecido para nascer de `req.session.user.id` e `unitScope`, sem alterar o payload publico observado.
- O endpoint entrou em retorno decrescente para novos testes ou patches nesta rodada.
- Este corte fica encerrado apenas com checkpoint documental.
- Nao houve alteracao em producao.