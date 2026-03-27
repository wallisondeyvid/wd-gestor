# Checkpoint: Gestor Unidades Delete Structural Seam Runtime Contract

Data: 2026-03-27
Escopo: prova estrutural minima da nova costura de DELETE /gestor/api/unidades/:id
Suite focal: tests/gestor-unidades-delete-structural-seam.test.js
Execucao focal: node --experimental-test-module-mocks --test .\tests\gestor-unidades-delete-structural-seam.test.js

## Costura validada

- O owner deleteUnidade em src/modules/gestor/app/controllers/unidadeApiController.js usa findUnidadeDeleteCandidateService e deleteUnidadeExecutionService como caminho principal do DELETE.
- O owner preserva o contrato publico local deste recorte: gate de role user, not found apos lookup, regra de unidade principal para diretor, envelope minimo de sucesso e mapeamento de erro HTTP.
- O service src/modules/gestor/app/services/unidades/deleteUnidadeExecution.service.js usa repositories reais de Unidade para ids validos e faz fallback minimo pela bridge compat apenas quando o id e invalido, preservando o contrato funcional antigo.

## Matriz coberta pela suite

- o owner preserva o gate de role user sem chamar o service fino
- o owner delega o lookup ao service fino e preserva 404 quando a unidade nao existe
- o owner preserva o envelope minimo de sucesso e usa o service fino de delete
- o owner preserva a regra de unidade principal para usuario nao master sem chamar o delete do service
- o owner preserva o 500 quando o service fino falha no lookup
- o lookup do service usa repository real para id valido
- o lookup do service faz fallback para bridge compat quando o id e invalido
- o delete do service usa repository real para id valido
- o delete do service faz fallback para bridge compat quando o id e invalido

## Limite desta prova

- esta suite nao revalida o contrato runtime amplo do endpoint no app real; isso permanece coberto por tests/gestor-unidades-delete-runtime-contract.test.js
- esta suite nao reabre provisioning, logo/logo-inline, GETs, listagens, toggle-access, update ou create
- esta suite valida apenas a nova costura estrutural introduzida por este microcorte