# Checkpoint: Gestor Modulos Update Structural Seam Runtime Contract

Data: 2026-03-26
Escopo: prova estrutural minima da nova costura de PUT /gestor/api/modulos/:id
Suite focal: tests/gestor-modulos-update-structural-seam-runtime-contract.test.js
Execucao focal: node --experimental-test-module-mocks --test .\tests\gestor-modulos-update-structural-seam-runtime-contract.test.js

## Costura validada

- O owner `atualizarModulo` em `src/modules/gestor/app/controllers/moduloApiController.js` usa `updateModuloByIdService` como caminho principal do PUT.
- `updateModuloByIdService` em `src/modules/gestor/app/services/modulos/updateModuloById.service.js` consulta o modulo pelo repository real, valida duplicidade nominal quando o nome muda e persiste o documento atualizado.
- O caminho principal validado nesta rodada deixa de depender da bridge compat `apiDbBridgeService -> legacy/apiDbBridgeService -> api.db.js` para executar o PUT de Modulos.

## Matriz coberta pela suite

- o owner encaminha `moduloId` e `changes` para o service fino e preserva `404` quando o alvo nao existe
- o service consulta duplicidade apenas quando o nome muda
- o service persiste o documento atualizado no caminho feliz
- o service retorna `duplicate_name` quando encontra nome em uso

## Limite desta prova

- esta suite nao revalida o contrato funcional amplo de PUT /gestor/api/modulos/:id, que permanece congelado no checkpoint de runtime anterior
- esta suite nao reabre listagem, get por id, create ou delete de Modulos
- esta suite valida apenas a nova costura estrutural introduzida por este recorte