# Checkpoint: Gestor Tenant Enforcement User API Nona Fatia Macro

## Snapshot

- Branch: migration/refactor-core
- HEAD consolidado: 55deaa2
- Worktree: limpo antes da criacao deste checkpoint
- Baseline consolidado atual: feat(gestor-tenant): endurece source scope de user api

## Familia consolidada

- tenant enforcement da familia User API do Gestor

## Foco explicito

- GET /gestor/api/modulos
- GET /gestor/api/usuario como contrato de apoio

## Fronteira do recorte

- src/modules/gestor/app/services/auth/resolveUserApiModulosCanonicalResult.service.js

## Invariantes atendidos

- o endurecimento ficou concentrado em resolveUserApiModulosCanonicalResult.service.js
- userApi.js permaneceu sem diff material
- userController.js permaneceu sem diff material
- o service deixou de devolver not-applicable nos caminhos tenant-sensitive quando a flag de auth-context esta ligada
- o fallback legado deixou de ser fonte de autorizacao tenant-sensitive no corredor principal
- selecao pendente continuou retornando 409
- master e admin continuaram com visibilidade global
- gestor e user continuaram presos a unidade ativa canonica
- GET /gestor/api/usuario permaneceu coerente como contrato de apoio
- a falha em GET /gestor/api/unidades/:id/modulos foi diagnosticada como lateral e fora do corredor principal desta fatia

## Testes focais que validaram o recorte

- tests/gestor-auth-modulos-endpoint-structural-seam.test.js
- tests/gestor-auth-user-endpoint-context.test.js
- tests/gestor-auth-user-endpoint-runtime-contract.test.js

## Motivo de parada

- consolidacao isolada da nona fatia macro de tenant enforcement, sem tocar em middlewares globais, outras familias, contrato HTTP global ou documentacao adicional