# Checkpoint: Gestor Setores Update Structural Seam Runtime Contract

Data: 2026-03-26
Escopo: prova estrutural minima da nova costura de PUT /gestor/api/setores/:id
Suite focal: tests/gestor-setores-update-structural-seam-runtime-contract.test.js
Execucao focal: node --experimental-test-module-mocks --test .\tests\gestor-setores-update-structural-seam-runtime-contract.test.js

## Costura validada

- O owner `updateSetor` em `src/modules/gestor/app/controllers/setorApiController.js` usa `updateSetorScopedService` como caminho principal do PUT.
- `updateSetorScopedService` em `src/modules/gestor/app/services/setores/updateSetorScoped.service.js` consulta o alvo pelo repository real de Setores, valida duplicidade por nome normalizado e persiste o documento atualizado.
- O caminho principal validado nesta rodada deixa de depender da bridge compat `apiDbBridgeService -> legacy/apiDbBridgeService -> api.db.js` para executar o PUT de Setores.

## Matriz coberta pela suite

- o owner encaminha `setorId`, `canonicalUnitId` e `changes` para o service fino e preserva `404` quando o alvo nao existe
- o service consulta duplicidade por nome normalizado na mesma unidade
- o service persiste o documento atualizado no caminho feliz
- o service retorna `duplicate_name` quando encontra outro setor com o mesmo nome normalizado

## Limite desta prova

- esta suite nao revalida o contrato funcional amplo de PUT /gestor/api/setores/:id, que permanece congelado no checkpoint de runtime anterior
- esta suite nao reabre listagem, get por id, get por unidade, create, delete, contador ou debug
- esta suite valida apenas a nova costura estrutural introduzida por este recorte