# Checkpoint: Gestor Tenant Enforcement Familia Recursos Terceira Fatia Macro

## Snapshot

- Branch: migration/refactor-core
- HEAD consolidado: 921ae88
- Worktree: limpo antes da criacao deste checkpoint
- Baseline consolidado atual: feat(gestor-tenant): endurece family scope de recursos

## Familia consolidada

- tenant enforcement da familia Recurso API

## Fronteira do recorte

- src/modules/gestor/app/routes/recursoApi.js
- src/modules/gestor/app/services/recursos/createRecursoContextPolicyCore.js
- tests/gestor-recursos-context-policy-structural.test.js
- tests/gestor-recursos-delete-runtime-contract.test.js

## Invariantes atendidos

- a policy local deixou de aceitar fallback por currentUser.unidade_id e sessionUser.unidade_id
- a resolucao canonica passou a depender apenas de scopedUnitId
- a borda local preservou a negacao controlada da familia ao absorver apenas UNIDADE_ID_REQUIRED
- o harness de delete foi alinhado ao servico real e a assinatura atual
- os contratos runtime de create, delete e list foram preservados

## Testes focais que validaram o recorte

- tests/gestor-recursos-create-runtime-contract.test.js
- tests/gestor-recursos-delete-runtime-contract.test.js
- tests/gestor-recursos-list-structural-seam-runtime-contract.test.js
- tests/gestor-recursos-context-policy-structural.test.js

## Motivo de parada

- consolidacao isolada da terceira fatia macro de tenant enforcement, sem tocar em outras familias, nucleo compartilhado, contrato HTTP global ou documentacao adicional