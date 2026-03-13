# Bridge Subfase 2

- Branch: `migration/refactor-core`
- Commit HEAD: `ed6a6830239459a8251318d8f6c035c4612a72c7`

## Objetivo da subfase

- Reduzir localmente a bridge híbrida em `api.db.js`, removendo `GLOBAL_SCOPE` fixo apenas onde o filtro já permitia derivar tenant inequívoco, sem abrir middleware, rotas, controllers ou refactor amplo.

## Helpers da bridge endurecidos nesta subfase

- `findSetoresByCondNomeOrdenadosSelectLean`: passou a resolver `unitScope` por `scopeFromSetorFiltro(cond)`, mantendo `GLOBAL_SCOPE` apenas como fallback quando o filtro não identifica uma única unidade.

## Superfícies já canônicas

- A borda HTTP crítica do Gestor permanece endurecida por `requireUnitScope` e pelo fluxo context-first já consolidado.
- Os lookups canônicos de unidades e cluster consolidados antes deste checkpoint permanecem válidos e sustentam o estado atual da bridge.

## Híbridos controlados deixados de propósito

- `pagesController.js` permanece como híbrido controlado nos fallbacks legados.
- Helpers ainda em `GLOBAL_SCOPE` ficam restritos a fluxos deliberadamente globais, privilegiados ou de compatibilidade quando o filtro não é inequívoco.

## Suítes focais que sustentam o estado atual

- `tests/gestor-unidades-unit-scope-canonical.test.js`
- `tests/gestor-unidades-writes-misc-unit-scope-canonical.test.js`
- `tests/gestor-setor-recurso-unit-scope-canonical.test.js`
- `tests/gestor-funcionarios-funcoes-unit-scope-canonical.test.js`

## Próxima fase prioritária

- Abrir uma nova rodada apenas com auditoria read-only dos resíduos restantes em `api.db.js` e seguir para outro micro-patch somente se ainda existir hotspot real de fail-open, não apenas fallback de compatibilidade.