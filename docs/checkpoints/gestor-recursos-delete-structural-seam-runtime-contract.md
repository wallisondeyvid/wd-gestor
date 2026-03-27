# Checkpoint: Gestor Recursos Delete Structural Seam Runtime Contract

Data: 2026-03-26
Escopo: prova estrutural minima da nova costura de DELETE /gestor/api/recursos/:id
Suite focal: tests/gestor-recursos-delete-structural-seam-runtime-contract.test.js
Execucao focal: node --experimental-test-module-mocks --test .\tests\gestor-recursos-delete-structural-seam-runtime-contract.test.js

## Costura validada

- O owner deleteRecurso em src/modules/gestor/app/controllers/recursoApiController.js usa deleteRecursoScopedService como caminho principal do DELETE.
- O owner preserva o mapeamento de 404 quando o service nao encontra recurso no escopo efetivo.
- O service deleteRecursoScopedService em src/modules/gestor/app/services/recursos/deleteRecursoScoped.service.js delega a exclusao direto para deleteRecursoByIdRepo em escopo unitario e global.

## Fora do escopo

- GET /gestor/api/recursos
- GET /gestor/api/recursos/:id
- POST /gestor/api/recursos
- PUT /gestor/api/recursos/:id
- bridge compat residual fora do caminho principal do DELETE