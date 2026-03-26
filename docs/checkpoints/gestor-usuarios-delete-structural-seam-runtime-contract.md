# Checkpoint: Gestor Usuarios Delete Structural Seam Runtime Contract

Data: 2026-03-26
Escopo: prova estrutural minima da nova costura de POST /gestor/api/usuarios/:id/delete
Suite focal: tests/gestor-usuarios-delete-structural-seam-runtime-contract.test.js
Execucao focal: node --experimental-test-module-mocks --test .\tests\gestor-usuarios-delete-structural-seam-runtime-contract.test.js

## Costura validada

- O owner excluirUsuario em src/modules/gestor/app/controllers/userController.js usa deleteUsuarioExecutionService como caminho principal da execucao mutacional do endpoint canonico.
- deleteUsuarioExecutionService em src/modules/gestor/app/services/usuarios/deleteUsuarioExecution.service.js executa o delete do usuario e o cleanup opcional de vinculo com funcionario pelos repositories reais.
- As regras publicas permanecem no owner: master-only, autoexclusao, bloqueio de exclusao de usuario master e resposta XHR versus redirect.

## Matriz coberta pela suite

- o owner chama o service fino no caminho feliz XHR com userId e vinculoFuncionarioId corretos
- o owner preserva autoexclusao sem chamar o service fino
- o owner preserva bloqueio de exclusao de usuario master sem chamar o service fino
- o service executa delete e cleanup opcional pelos repositories reais
- o service nao tenta cleanup quando nao ha vinculoFuncionarioId

## Limite desta prova

- esta suite nao revalida o contrato runtime amplo de POST /gestor/api/usuarios/:id/delete no app real
- esta suite nao reabre update, toggle, listagens ou outros fluxos administrativos
- esta suite valida apenas a nova costura estrutural introduzida por este recorte