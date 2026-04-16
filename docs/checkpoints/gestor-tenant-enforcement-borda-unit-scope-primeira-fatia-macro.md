# Checkpoint: Gestor Tenant Enforcement Borda UnitScope Primeira Fatia Macro

## Snapshot

- Branch: migration/refactor-core
- HEAD consolidado: b61fb90
- Worktree: limpo antes da criacao deste checkpoint
- Baseline consolidado atual: feat(gestor-tenant): endurece borda unitScope

## Familia consolidada

- tenant enforcement da borda unitScope do Gestor

## Fronteira do recorte

- src/modules/gestor/app/middlewares/requireUnitScope.js
- src/modules/gestor/app/middlewares/requireLogin.js
- src/modules/gestor/app/gestor-app.js

## Invariantes atendidos

- rota tenant-sensitive nao segue mais com req.unitScope global implicito
- ausencia de unidade valida falha explicitamente
- active_unidade_id e active_funcionario_id canonicos prevalecem sobre unidade legada divergente
- selecao pendente e privilegio administrativo foram preservados

## Testes focais que validaram o recorte

- tests/gestor.requireUnitScope.test.js
- tests/gestor-unidades-unit-scope-canonical.test.js
- tests/architecture/repository-unitScope.test.js

## Motivo de parada

- consolidacao isolada da primeira fatia macro de tenant enforcement, sem tocar em rotas, controllers, contrato HTTP ou compat layers