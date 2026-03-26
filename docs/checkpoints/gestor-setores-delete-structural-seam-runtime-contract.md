# Checkpoint: Gestor Setores Delete Structural Seam Runtime Contract

Data: 2026-03-26
Escopo: prova estrutural minima da nova costura de DELETE /gestor/api/setores/:id
Suite focal: tests/gestor-setores-delete-structural-seam-runtime-contract.test.js
Execucao focal: node --experimental-test-module-mocks --test .\tests\gestor-setores-delete-structural-seam-runtime-contract.test.js

## Costura validada

- O owner `deleteSetor` em `src/modules/gestor/app/controllers/setorApiController.js` usa `deleteSetorScopedService` como caminho principal do DELETE escopado.
- `deleteSetorScopedService` em `src/modules/gestor/app/services/setores/deleteSetorScoped.service.js` consulta e exclui diretamente pelo repository real de Setores.
- O caminho principal validado nesta rodada deixa de depender da bridge compat `apiDbBridgeService -> legacy/apiDbBridgeService -> api.db.js` para executar o DELETE escopado.

## Matriz coberta pela suite

- o owner encaminha `setorId` e `unidadeId` contextual para o service fino e preserva o `404` quando o service nao encontra alvo
- o service consulta e exclui pelo mesmo alvo escopado no repository
- o service nao tenta excluir quando o lookup escopado nao encontra alvo

## Limite desta prova

- esta suite nao revalida o contrato funcional amplo de DELETE /gestor/api/setores/:id no app real
- esta suite nao reabre listagem, get por id, get por unidade, create, update, contador ou debug
- esta suite valida apenas a nova costura estrutural introduzida por este recorte