# Checkpoint: Gestor Tenant Enforcement Familia Funcionarios Segunda Fatia Macro

## Snapshot

- Branch: migration/refactor-core
- HEAD consolidado: febb7ee
- Worktree: limpo antes da criacao deste checkpoint
- Baseline consolidado atual: feat(gestor-tenant): endurece family scope de funcionarios

## Familia consolidada

- tenant enforcement da familia Funcionario API

## Fronteira do recorte

- src/modules/gestor/app/routes/funcionarioApi.js
- src/modules/gestor/app/controllers/funcionarioApiController.js
- tests/gestor-funcionarios-api-context-precedence.test.js

## Invariantes atendidos

- a borda da familia deixou de aceitar bypass por unidade legada autenticada
- a autorizacao por alvo deixou de inferir contexto canonico e unidade operacional auxiliar pela sessao legada
- os contratos runtime de disponiveis e match foram preservados
- a suite de precedencia foi alinhada ao novo enforcement com UNIDADE_ID_REQUIRED

## Testes focais que validaram o recorte

- tests/gestor-funcionarios-disponiveis-runtime-contract.test.js
- tests/gestor-funcionarios-match-runtime-contract.test.js
- tests/gestor-funcionarios-crud-unit-scope-canonical.test.js
- tests/gestor-funcionarios-api-context-precedence.test.js

## Motivo de parada

- consolidacao isolada da segunda fatia macro de tenant enforcement, sem tocar em outras familias, rotas fora da familia, contrato HTTP global ou documentacao adicional