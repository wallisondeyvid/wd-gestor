# Checkpoint: Gestor Tenant Enforcement Familia Unidades Quinta Fatia Macro

## Snapshot

- Branch: migration/refactor-core
- HEAD consolidado: 527ff25
- Worktree: limpo antes da criacao deste checkpoint
- Baseline consolidado atual: feat(gestor-tenant): endurece family scope de unidades

## Familia consolidada

- tenant enforcement da familia Unidade API

## Fronteira do recorte

- src/modules/gestor/app/controllers/unidadeApiController.js
- tests/gestor-unidades-policy-context-structural.test.js
- tests/gestor-unidades-delete-runtime-contract.test.js

## Invariantes atendidos

- resolveRequestedPrincipalUnitId passou a fazer prevalecer imediatamente a principal canonica quando ela existe
- sem principal canonica, usuario nao privilegiado passa a ser bloqueado explicitamente
- requestedPrincipalUnitId e fallbackPrincipalUnitId ficam restritos ao caminho privilegiado sem contexto canonico
- unidadeApi.js permaneceu sem diff material
- os contratos runtime de create, update, toggle-access, get by id, modulos, provisioning, retry provisioning, provisioning events, delete e cluster runtime foram preservados
- o harness de delete foi alinhado ao seam real usado pelo controller

## Testes focais que validaram o recorte

- tests/gestor-unidades-policy-context-structural.test.js
- tests/gestor-unidades-unit-scope-canonical.test.js
- tests/gestor-unidades-writes-misc-unit-scope-canonical.test.js
- tests/gestor-unidades-create-runtime-contract.test.js
- tests/gestor-unidades-update-runtime-contract.test.js
- tests/gestor-unidades-update-owner-structural-seam.test.js
- tests/gestor-unidades-toggle-access-runtime-contract.test.js
- tests/gestor-unidades-toggle-access-owner-structural-seam.test.js
- tests/gestor-unidades-get-by-id-runtime-contract.test.js
- tests/gestor-unidades-modulos-runtime-contract.test.js
- tests/gestor-unidades-provisioning-runtime-contract.test.js
- tests/gestor-unidades-provisioning-retry-runtime-contract.test.js
- tests/gestor-unidades-provisioning-events-runtime-contract.test.js
- tests/gestor-unidades-delete-runtime-contract.test.js
- tests/gestor-api-unidades-cluster-runtime-contract.test.js

## Motivo de parada

- consolidacao isolada da quinta fatia macro de tenant enforcement, sem tocar em outras familias, nucleo compartilhado, contrato HTTP global ou documentacao adicional