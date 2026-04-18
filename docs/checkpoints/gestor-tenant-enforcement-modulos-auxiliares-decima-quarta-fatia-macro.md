# Checkpoint: Gestor Tenant Enforcement Modulos Auxiliares Decima Quarta Fatia Macro

## Snapshot

- Branch: migration/refactor-core
- HEAD consolidado: 0641a9e
- Worktree: limpo antes da criacao deste checkpoint
- Baseline consolidado atual: feat(gestor-tenant): endurece modulos auxiliares

## Familia consolidada

- tenant enforcement da familia Modulos auxiliares e gate de acesso por modulo do Gestor

## Foco explicito

- endurecimento da unidade efetiva no corredor de listagem de modulos para privilegiar o auth-context canonico ativo
- eliminacao de req.user.unidade_id como fonte material concorrente quando auth-context-v1 estiver ativo

## Fronteira do recorte

- src/modules/gestor/app/controllers/moduloApiController.js
- src/modules/gestor/app/services/modulos/listModulosOwner.service.js
- tests/gestor-modulos-list-owner-structural-seam.test.js

## Invariantes atendidos

- moduloApiController.js deixou de aceitar req.user.unidade_id como fonte material concorrente quando auth-context-v1 estiver ativo
- listModulosOwner.service.js passou a distinguir explicitamente branch canonico e branch legacy
- master e admin continuam globais
- a compatibilidade legacy com flag desligada foi preservada
- createLoginModuleAccessCore.js permaneceu sem diff material e ja estava aderente ao invariante
- moduloApi.js permaneceu sem diff material

## Testes focais que validaram o recorte

- tests/gestor-auth-modulos-endpoint-context.test.js
- tests/gestor-auth-login-module-access-structural-seam.test.js
- tests/gestor-modulos-list-owner-structural-seam.test.js
- tests/gestor-auth-login-first-authenticated-request-runtime-contract.test.js

## Motivo de parada

- consolidacao isolada da decima quarta fatia macro de tenant enforcement, sem tocar em producao, testes adicionais, migration-status ou outros corredores documentais