# Checkpoint: Gestor Modulos Delete Runtime Structural Contract

Data: 2026-03-26
Escopo: caracterizacao executavel minima do contrato essencial e da costura estrutural de DELETE /gestor/api/modulos/:id
Suite focal: tests/gestor-modulos-delete-runtime-structural-contract.test.js
Execucao focal: node --experimental-test-module-mocks --test .\tests\gestor-modulos-delete-runtime-structural-contract.test.js

## Contrato essencial validado

- Sem permissao suficiente, o owner responde `400` com `success=false`, `code='BAD_REQUEST'` e `message='Permissão insuficiente'`.
- Quando o service fino nao encontra alvo, o owner responde `404` com `success=false`, `code='NOT_FOUND'` e `message='Módulo não encontrado'`.
- Quando o service fino exclui o alvo, o owner responde `200` com envelope minimo `{ deleted: true, id }`.

## Costura validada

- O owner `excluirModulo` em `src/modules/gestor/app/controllers/moduloApiController.js` usa `deleteModuloByIdService` como caminho principal do DELETE.
- `deleteModuloByIdService` em `src/modules/gestor/app/services/modulos/deleteModuloById.service.js` consulta e exclui diretamente pelo repository real de Modulos.
- O caminho principal validado nesta rodada deixa de depender da bridge compat `apiDbBridgeService -> legacy/apiDbBridgeService -> api.db.js` para executar o DELETE de Modulos.

## Matriz coberta pela suite

- permissao insuficiente sem chamar o service fino
- owner encaminha `moduloId` para o service fino e preserva `404` quando o alvo nao existe
- owner responde com envelope minimo de sucesso quando o service exclui o alvo
- service consulta e exclui pelo mesmo id no repository global
- service nao tenta excluir quando o lookup nao encontra alvo

## Limite desta prova

- esta suite nao reabre listagem, get por id, create ou update de Modulos
- esta suite nao revalida gate `401` sem sessao no app real
- esta suite valida apenas o minimo necessario para congelar este recorte especifico