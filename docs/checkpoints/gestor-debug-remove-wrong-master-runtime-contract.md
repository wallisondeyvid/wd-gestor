# Checkpoint: Gestor Debug Remove Wrong Master Runtime Contract

Data: 2026-03-27
Escopo: caracterizacao runtime conservadora apenas do contrato funcional de POST /gestor/admin/remove-wrong-master
Suite focal: tests/gestor-debug-remove-wrong-master-runtime-contract.test.js
Execucao focal: node --test .\tests\gestor-debug-remove-wrong-master-runtime-contract.test.js

## Wiring confirmado

- O corredor continua exposto por debugApi em [src/modules/gestor/app/routes/debugApi.js](src/modules/gestor/app/routes/debugApi.js)
- A rota canonica do recorte permanece POST /gestor/admin/remove-wrong-master
- O owner real continua sendo removeWrongMaster em [src/modules/gestor/app/controllers/debugApiController.js](src/modules/gestor/app/controllers/debugApiController.js)

## Limite deliberado do microcorte

- Este checkpoint nao reabre debugSession, whoAmI, userByEmail, userByCpf, testUnidades, versionInfo, debug mailer, biometria, face upload ou prova estrutural do novo service
- O foco aqui e somente o contrato publico observado de POST /gestor/admin/remove-wrong-master

## Contrato observado

- sem sessao, o runtime redireciona para /gestor/login
- autenticado sem master, o runtime bloqueia com 400 e mensagem Acesso negado
- autenticado como master e sem usuario alvo, o runtime responde 200 com removed=false e mensagem Usuario incorreto nao encontrado
- autenticado como master e com usuario alvo presente, o runtime responde 200 com removed=true e mensagem Usuario incorreto removido

## Matriz coberta pela suite

- gate de autenticacao da rota com redirect para login
- gate de master no owner
- envelope de sucesso quando nao encontra o alvo hardcoded
- envelope de sucesso quando encontra e remove o alvo hardcoded

## Decisao final

- O contrato funcional observavel de POST /gestor/admin/remove-wrong-master ficou congelado localmente neste microcorte
- Nenhum outro endpoint de Debug API foi reaberto nesta rodada