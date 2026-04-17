# Checkpoint: Gestor Tenant Enforcement Pages Unidades Oitava Fatia Macro

## Snapshot

- Branch: migration/refactor-core
- HEAD consolidado: 70f2740
- Worktree: limpo antes da criacao deste checkpoint
- Baseline consolidado atual: feat(gestor-tenant): endurece pages scope de unidades

## Familia consolidada

- tenant enforcement da familia Pages do Gestor no corredor de Unidades

## Foco explicito

- paginaUnidades
- paginaEditarUnidade

## Fronteira do recorte

- src/modules/gestor/app/controllers/views/pagesController.js

## Invariantes atendidos

- paginaEditarUnidade passou a validar o alvo contra o cluster canonico antes do lookup global
- o ramo nao privilegiado sem contexto passou a falhar com 403 antes do lookup global do alvo
- paginaUnidades permaneceu context-first
- pagesRouter.js permaneceu sem diff material
- loadPaginaUnidadesBundle.service.js permaneceu sem diff material
- loadPaginaUnidadesDiretores.service.js permaneceu sem diff material
- unidadesDiretoresPageDataFacade.js permaneceu sem diff material
- os contratos runtime ja observados do corredor foram preservados

## Testes focais que validaram o recorte

- tests/gestor-unidades-unit-scope-canonical.test.js
- tests/gestor-unidades-load-pagina-bundle-structural-seam.test.js

## Motivo de parada

- consolidacao isolada da oitava fatia macro de tenant enforcement, sem tocar em middlewares globais, outras paginas, outras familias ou documentacao adicional