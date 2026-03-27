# Checkpoint: Gestor Funcionarios Delete Post Structural Seam Runtime Contract

Data: 2026-03-27
Escopo: prova estrutural minima da nova costura de POST /gestor/api/funcionarios/:id/delete
Suite focal: tests/gestor-funcionarios-delete-post-structural-seam.test.js
Execucao focal: node --experimental-test-module-mocks --test .\tests\gestor-funcionarios-delete-post-structural-seam.test.js

## Costura validada

- O owner deleteFuncionarioPost em src/modules/gestor/app/controllers/funcionarioApiController.js usa deleteFuncionarioPostExecutionService como caminho principal do POST delete.
- O owner preserva o contrato publico local deste recorte: ramo alreadyRemoved, bloqueio HTTP quando existe usuario master vinculado, payload final com redirect e tratamento de falha interna.
- deleteFuncionarioPostExecutionService em src/modules/gestor/app/services/funcionarios/deleteFuncionarioPostExecution.service.js faz lookup escopado do funcionario, lookup global do usuario vinculado e delete escopado direto pelos repositories reais de Funcionarios e User.

## Matriz coberta pela suite

- o owner encaminha funcionarioId e canonicalUnitId para o service fino e preserva o ramo alreadyRemoved
- o owner preserva o 403 quando o service retorna forbidden_master_link
- o owner preserva o payload final de sucesso com redirect quando o service retorna deleted
- o owner preserva o 500 quando o service fino falha
- o service retorna already_removed sem tentar user lookup nem delete quando o lookup escopado nao encontra alvo
- o service faz lookup global do usuario vinculado e bloqueia o delete quando encontra role master
- o service usa a unidade do proprio funcionario para excluir quando nao ha contexto canonico
- o service mantem a unidade canonica no lookup e no delete quando ela existe

## Limite desta prova

- esta suite nao revalida o contrato runtime amplo do endpoint no app real; isso permanece coberto pela suite gestor-funcionarios-delete-post-runtime-contract.test.js
- esta suite nao reabre o DELETE irmao, create, update, GET, foto, anexos, biometria, match, disponiveis ou uploads
- esta suite valida apenas a nova costura estrutural introduzida por este microcorte