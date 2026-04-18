# Checkpoint: Gestor Tenant Enforcement Cluster Unidades Decima Primeira Fatia Macro

## Snapshot

- Branch: migration/refactor-core
- HEAD consolidado: 52f19f8
- Worktree: limpo antes da criacao deste checkpoint
- Baseline consolidado atual: feat(gestor-tenant): endurece cluster scope auxiliar

## Familia consolidada

- tenant enforcement da familia Cluster de Unidades do Gestor

## Foco explicito

- endurecimento do corredor de leitura de cluster para usuarios nao privilegiados
- derivacao do cluster permitido a partir do contexto efetivo, e nao do alvo informado

## Fronteira do recorte

- src/modules/gestor/app/controllers/apiController.js
- src/modules/gestor/app/controllers/miscApiController.js

## Invariantes atendidos

- apiController.js deixou de fazer o cluster permitido do nao privilegiado nascer do alvo informado
- miscApiController.js foi alinhado ao mesmo criterio
- o anchor do cluster do nao privilegiado passa a nascer do contexto efetivo
- o alvo informado vira apenas validacao de pertencimento ao cluster permitido
- master e admin permaneceram globais
- o contrato de lista vazia fora do contexto ativo foi preservado
- api.js permaneceu sem diff material
- miscApi.js permaneceu sem diff material

## Testes focais que validaram o recorte

- tests/unidadesCluster.contract.test.js
- tests/gestor-api-unidades-cluster-runtime-contract.test.js
- tests/gestor-api-unidades-cluster-structural-seam-runtime-contract.test.js
- tests/gestor-unidades-writes-misc-unit-scope-canonical.test.js
- tests/miscApi.test.js

## Motivo de parada

- consolidacao isolada da decima primeira fatia macro de tenant enforcement, sem tocar em producao, testes, migration-status ou outros corredores documentais