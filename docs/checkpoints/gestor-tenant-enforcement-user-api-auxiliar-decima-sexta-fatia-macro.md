# Checkpoint: Gestor Tenant Enforcement User API Auxiliar Decima Sexta Fatia Macro

## Snapshot

- Branch: migration/refactor-core
- HEAD consolidado: bfc7eb4
- Worktree: limpo antes da criacao deste checkpoint
- Baseline consolidado atual: feat(gestor-tenant): endurece user api auxiliar

## Familia consolidada

- tenant enforcement da familia User API auxiliar de criacao e preflight de usuarios administrativos do Gestor

## Foco explicito

- endurecimento do corredor de POST /gestor/api/usuarios para eliminar promocao de unidade por funcionario como fonte material concorrente
- endurecimento do corredor de GET /gestor/api/usuarios/check-email para ancorar o ramo contextual em escopo explicito e filtrar memberships no ramo autoritativo

## Fronteira do recorte

- src/modules/gestor/app/controllers/userController.js
- src/modules/gestor/app/services/usuarios/createUsuarioExecution.service.js
- src/modules/gestor/app/services/usuarios/checkUsuarioEmailOwner.service.js

## Invariantes atendidos

- POST /gestor/api/usuarios deixou de promover unidade_id a partir de funcionario_id como fonte material concorrente
- em createUsuarioExecution.service.js, a sincronizacao do user agora so usa unidadeId ja resolvido
- GET /gestor/api/usuarios/check-email passou a aceitar escopo explicito e filtrar memberships no ramo contextual autoritativo
- userController.js passou a enviar escopo explicito ao owner de check-email
- checkUsuarioEmailOwner.service.js filtra memberships por unidades permitidas quando houver auth-context-v1 autoritativo
- o ramo global de master e admin foi preservado
- nao foi introduzido fallback concorrente por req.user.unidade_id, req.session.user.unidade_id ou active_unidade_id
- userApi.js permaneceu sem diff material

## Testes focais que validaram o recorte

- tests/gestor-user-create-or-link.test.js
- tests/gestor-user-check-email-owner-structural-seam.test.js
- tests/gestor-criar-usuario-execution-structural-seam.test.js
- tests/gestor-usuarios-create-membership-structural.test.js
- tests/gestor-usuarios-create-user-materialization-structural.test.js
- tests/gestor-usuarios-create-funcionario-link-structural.test.js
- tests/gestor-funcionario-anchor-by-id-unit-scope-bridge.test.js
- tests/gestor-usuario-create-set-if-empty-unit-scope-bridge.test.js

## Motivo de parada

- consolidacao isolada da decima sexta fatia macro de tenant enforcement, sem tocar em producao fora da familia User API auxiliar, sem alterar testes, migration-status ou outros corredores documentais