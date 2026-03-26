# Checkpoint: Gestor Funcoes Delete Structural Seam Runtime Contract

Data: 2026-03-26
Escopo: prova estrutural minima da nova costura de DELETE /gestor/api/funcoes/:id
Suite focal: tests/gestor-funcoes-delete-structural-seam-runtime-contract.test.js
Execucao focal: node --experimental-test-module-mocks --test .\tests\gestor-funcoes-delete-structural-seam-runtime-contract.test.js

## Costura validada

- O owner deleteFuncao em src/modules/gestor/app/controllers/funcaoApiController.js usa deleteFuncaoScopedService como caminho principal do DELETE.
- deleteFuncaoScopedService em src/modules/gestor/app/services/funcoes/deleteFuncaoScoped.service.js consulta e exclui diretamente pelo repository real de Funcoes.
- A semantica contextual do corredor foi preservada: com principal contextual resolvida, lookup e delete usam essa principal; sem contexto, o delete usa a principal da propria funcao encontrada.

## Matriz coberta pela suite

- o owner resolve a principal contextual e encaminha funcaoId mais canonicalPrincipalUnitId ao service fino, preservando 404 quando o service nao encontra alvo
- o service usa a principal da propria funcao para excluir quando nao ha contexto canonico
- o service usa a principal contextual tanto no lookup quanto no delete quando ela existe
- o service nao tenta excluir quando id invalido ou lookup ausente nao encontram alvo

## Limite desta prova

- esta suite nao revalida o contrato funcional amplo de DELETE /gestor/api/funcoes/:id no app real
- esta suite nao reabre create, update, get, listagem ou bulk update de Funcoes
- esta suite valida apenas a nova costura estrutural introduzida por este recorte