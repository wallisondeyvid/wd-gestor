# Checkpoint: Gestor Tenant Enforcement Auth Auxiliar Decima Fatia Macro

## Snapshot

- Branch: migration/refactor-core
- HEAD consolidado: f77287d
- Worktree: limpo antes da criacao deste checkpoint
- Baseline consolidado atual: feat(gestor-tenant): endurece auth auxiliar

## Familia consolidada

- tenant enforcement da familia Auth auxiliar do Gestor

## Foco explicito

- projecao legacy sob auth-context-v1 autoritativo
- gate de acesso por modulo no corredor de login

## Fronteira do recorte

- src/modules/gestor/app/services/auth/createLoginModuleAccessCore.js
- src/modules/gestor/app/services/auth/resolveRequireRoleLegacyUser.service.js
- tests/requireRole.test.js
- tests/gestor-auth-login-module-access-runtime-contract.test.js
- tests/gestor-auth-login-module-access-structural-seam.test.js
- tests/gestor-auth-login-first-authenticated-request-runtime-contract.test.js

## Invariantes atendidos

- createLoginModuleAccessCore.js deixou de usar userDoc.unidade_id como fallback material quando a fonte ja e auth-context-v1
- resolveRequireRoleLegacyUser.service.js deixou de aceitar requestUser.unidade_id e sessionUser.unidade_id como fonte efetiva quando o auth-context-v1 ja e autoritativo
- master e admin permaneceram globais
- o corredor de login e os wrappers auxiliares permaneceram coerentes com select-unit e switch-unit
- requireRole.js permaneceu sem diff material
- authController.js permaneceu sem diff material
- routes/auth.js permaneceu sem diff material

## Testes focais que validaram o recorte

- tests/gestor-auth-login-module-access-runtime-contract.test.js
- tests/gestor-auth-login-module-access-structural-seam.test.js
- tests/gestor-auth-login-first-authenticated-request-runtime-contract.test.js
- tests/requireRole.test.js
- tests/gestor-require-role-structural-seam.test.js
- tests/gestor-require-login-resolved-user-structural-seam.test.js
- tests/gestor-auth-context-select-unit-runtime-contract.test.js
- tests/gestor-auth-context-switch-unit-runtime-contract.test.js
- tests/gestor-auth-context-select-unit-structural-seam.test.js
- tests/gestor-user-check-email.test.js
- tests/widgetSettings.contract.test.js

## Motivo de parada

- consolidacao isolada da decima fatia macro de tenant enforcement, sem tocar em producao, testes adicionais, migration-status ou outros corredores documentais