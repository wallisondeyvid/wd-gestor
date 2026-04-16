# Checkpoint: Gestor Tenant Enforcement Pages Funcionarios Sexta Fatia Macro

## Snapshot

- Branch: migration/refactor-core
- HEAD consolidado: 086710b
- Worktree: limpo antes da criacao deste checkpoint
- Baseline consolidado atual: feat(gestor-tenant): endurece pages scope de funcionarios

## Familia consolidada

- tenant enforcement da familia Pages do Gestor, focada em paginaFuncionarios

## Fronteira do recorte

- src/modules/gestor/app/controllers/views/pagesController.js
- tests/gestor-funcionarios-funcoes-unit-scope-canonical.test.js

## Invariantes atendidos

- loadScopedOperationalUnitContextForFuncionariosPage deixou de promover unidade operacional por req.user.unidade_id
- loadScopedOperationalUnitContextForFuncionariosPage deixou de promover unidade operacional por req.session.user.unidade_id
- quando existe contexto canonico, a unidade efetiva de paginaFuncionarios passa a ser sempre a de req.unitScope
- loadPaginaFuncionariosBundle.service.js permaneceu sem diff material
- o novo teste congela explicitamente a precedencia da unidade canonica sobre a unidade legada divergente
- o ramo privilegiado global foi preservado
- os contratos runtime ja observados da pagina foram preservados

## Testes focais que validaram o recorte

- tests/gestor-funcionarios-funcoes-unit-scope-canonical.test.js
- tests/gestor-funcionarios-load-pagina-bundle-structural-seam.test.js

## Motivo de parada

- consolidacao isolada da sexta fatia macro de tenant enforcement, sem tocar em middlewares globais, outras paginas, outras familias ou documentacao adicional