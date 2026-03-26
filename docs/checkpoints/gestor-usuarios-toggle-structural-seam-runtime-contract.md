# Checkpoint: Gestor Usuarios Toggle Structural Seam Runtime Contract

Data: 2026-03-26
Escopo: prova estrutural minima da nova costura de POST /gestor/api/usuarios/:id/toggle
Suite focal: tests/gestor-usuarios-toggle-structural-seam-runtime-contract.test.js
Execucao focal: node --experimental-test-module-mocks --test .\tests\gestor-usuarios-toggle-structural-seam-runtime-contract.test.js

## Costura validada

- O owner toggleUsuario em src/modules/gestor/app/controllers/userController.js usa toggleUsuarioExecutionService como caminho principal da mutacao do endpoint canonico.
- toggleUsuarioExecutionService em src/modules/gestor/app/services/usuarios/toggleUsuarioExecution.service.js inverte user.ativo e persiste o proprio documento.
- As regras publicas permanecem no owner: autenticacao, gate admin/master, protecao de usuario master e resposta XHR versus redirect.

## Matriz coberta pela suite

- o owner chama o service fino no caminho feliz XHR e responde com o ativo atualizado
- o owner preserva a protecao de usuario master sem chamar o service
- o owner preserva o redirect no caminho nao XHR depois de delegar ao service
- o service inverte user.ativo e persiste o proprio documento

## Limite desta prova

- esta suite nao revalida o contrato runtime amplo de POST /gestor/api/usuarios/:id/toggle no app real
- esta suite nao reabre update, delete, listagens ou outros fluxos administrativos
- esta suite valida apenas a nova costura estrutural introduzida por este recorte