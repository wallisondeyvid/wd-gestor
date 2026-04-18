# Checkpoint: Gestor Tenant Enforcement Mutacoes Administrativas Legadas Decima Setima Fatia Macro

## Snapshot

- Branch: migration/refactor-core
- HEAD consolidado: 532ae60
- Worktree: limpo antes da criacao deste checkpoint
- Baseline consolidado atual: feat(gestor-tenant): endurece mutacoes administrativas legadas

## Familia consolidada

- tenant enforcement da familia User API de mutacoes administrativas legadas por alvo do Gestor

## Foco explicito

- endurecimento da borda do corredor legado de POST /gestor/api/usuarios/:id/update para impedir que o fluxo nasca sem guard suficiente
- endurecimento coerente dos corredores legados de POST /gestor/api/usuarios/:id/toggle e POST /gestor/api/usuarios/:id/delete para remover dependencia de guards neutralizados pelo wrapper

## Fronteira do recorte

- src/modules/gestor/app/routes/userApi.js
- src/shared/routes/userApi.js
- tests/gestor-usuarios-toggle-structural-seam-runtime-contract.test.js
- tests/gestor-usuarios-delete-structural-seam-runtime-contract.test.js

## Invariantes atendidos

- o wrapper do Gestor passou a aplicar requireLegacyAdminMutationAccess
- o router compartilhado passou a usar esse guard em update, toggle e delete
- o ramo autoritativo de auth-context-v1 ficou limitado a master e admin globais explicitos
- o corredor deixou de nascer sem guard suficiente no update
- toggle e delete deixaram de depender de guards neutralizados integralmente pelo wrapper
- os dois testes estruturais so receberam ajuste de harness, sem mudanca de contrato funcional
- a compatibilidade do ramo global explicito de master e admin foi preservada

## Testes focais que validaram o recorte

- tests/gestor-usuarios-admin-runtime-contract.test.js
- tests/gestor-usuarios-toggle-structural-seam-runtime-contract.test.js
- tests/gestor-usuarios-delete-structural-seam-runtime-contract.test.js
- tests/gestor-usuarios-bloqueados-runtime-contract.test.js
- tests/gestor-usuarios-unlock-runtime-contract.test.js
- tests/gestor-usuarios-status-runtime-contract.test.js

## Motivo de parada

- consolidacao isolada da decima setima fatia macro de tenant enforcement, sem tocar em producao fora da fronteira do corredor legado de mutacoes administrativas, sem alterar migration-status.md e sem ampliar o perimetro documental