# Checkpoint: Gestor Tenant Enforcement Debug API Decima Segunda Fatia Macro

## Snapshot

- Branch: migration/refactor-core
- HEAD consolidado: 79f3072
- Worktree: limpo antes da criacao deste checkpoint
- Baseline consolidado atual: feat(gestor-tenant): endurece debug api

## Familia consolidada

- tenant enforcement da familia Debug API do Gestor

## Foco explicito

- endurecimento contextual dos corredores de lookup por email e CPF para usuarios nao privilegiados
- fechamento da leitura de testUnidades para o cluster efetivo do contexto canonico

## Fronteira do recorte

- src/modules/gestor/app/controllers/debugApiController.js
- tests/gestor-debug-user-by-email-owner-structural-seam.test.js
- tests/gestor-debug-user-by-cpf-owner-structural-seam.test.js
- tests/debugUserAdmin.test.js

## Invariantes atendidos

- debugApiController.js passou a derivar primeiro o escopo permitido do contexto canonico efetivo
- email, CPF e unidade do alvo deixaram de ser fonte efetiva de tenant
- userByEmail e userByCpf so liberam payload quando o alvo pertence ao cluster permitido do contexto efetivo
- o ramo global de master e admin foi preservado
- testUnidades deixou de expor leitura global para nao privilegiado
- debugApi.js permaneceu sem diff material

## Testes focais que validaram o recorte

- tests/gestor-debug-user-by-email-runtime-contract.test.js
- tests/gestor-debug-user-by-email-owner-structural-seam.test.js
- tests/gestor-debug-user-by-cpf-runtime-contract.test.js
- tests/gestor-debug-user-by-cpf-owner-structural-seam.test.js
- tests/gestor-debug-remove-wrong-master-runtime-contract.test.js
- tests/debugUserAdmin.test.js

## Motivo de parada

- consolidacao isolada da decima segunda fatia macro de tenant enforcement, sem tocar em producao, testes, migration-status ou outros corredores documentais