# Checkpoint: Gestor Tenant Enforcement Auth Context Operacional Decima Terceira Fatia Macro

## Snapshot

- Branch: migration/refactor-core
- HEAD consolidado: 65faeea
- Worktree: limpo antes da criacao deste checkpoint
- Baseline consolidado atual: feat(gestor-tenant): endurece auth context operacional

## Familia consolidada

- tenant enforcement da familia Auth Context operacional do Gestor

## Foco explicito

- drenagem da projecao tenant-sensitive stale em session.user durante login com selecao pendente
- sincronizacao da projecao derivada da sessao quando select-unit e switch-unit consolidam uma membership ativa canonica

## Fronteira do recorte

- src/modules/gestor/app/controllers/authController.js
- tests/gestor-auth-context-select-unit-runtime-contract.test.js
- tests/gestor-auth-context-switch-unit-runtime-contract.test.js
- tests/gestor-auth-login-context.test.js

## Invariantes atendidos

- select-unit e switch-unit continuam tratando unidade_id apenas como alvo solicitado
- a autorizacao e a selecao continuam nascendo de memberships canonicas e do contexto resolvido
- o problema corrigido foi a persistencia de projecao tenant-sensitive stale em session.user
- login com selecao pendente agora limpa unidade_id, unidade_principal_id e funcionario_id tenant-sensitive sem inventar contexto ativo
- auth.js permaneceu sem diff material
- mutateAuthUnitContext.service.js permaneceu sem diff material

## Testes focais que validaram o recorte

- tests/gestor-auth-context-endpoint.test.js
- tests/gestor-auth-context-get-runtime-contract.test.js
- tests/gestor-auth-context-select-unit-runtime-contract.test.js
- tests/gestor-auth-context-switch-unit-runtime-contract.test.js
- tests/gestor-auth-select-unit-endpoint.test.js
- tests/gestor-auth-context-select-unit-structural-seam.test.js
- tests/gestor-auth-login-context.test.js

## Motivo de parada

- consolidacao isolada da decima terceira fatia macro de tenant enforcement, sem tocar em producao, testes, migration-status ou outros corredores documentais