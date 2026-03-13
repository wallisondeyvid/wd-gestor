# Checkpoint da bridge do Gestor - subfase 1

## 1. Branch, tag e commit HEAD

- Branch: migration/refactor-core
- Tag: checkpoint-bridge-subfase-1
- HEAD: ed88c8814a62abde93a83b34e75b662146201feb

## 2. Objetivo da subfase encerrada

Reduzir a bridge híbrida do Gestor em api.db.js nos helpers com fail-open real em multi-db, sem reabrir a borda HTTP crítica, middleware, rotas ou controllers críticos.

## 3. Hotspots fechados nesta subfase

Helpers da bridge endurecidos em `api.db.js`:

- `findClusterUnidadesByAnchorLean`
- `findUnidadesByCondLeanFull`
- `findUnidadesByCondLean`
- `findUnidadesByCondSelectCodigoNomeOrdenadasLean`
- `findUnidadesByIdsNomeCodigoLean`

## 4. Superfícies já canônicas

- `requireUnitScope` já endurecido contra injeção de `unitScope` por request para usuário não privilegiado.
- A borda HTTP crítica do Gestor já está protegida por `requireUnitScope` ou wrapper equivalente.
- `toggle-access` já protegido pelo contexto ativo.
- `testar-banco` já protegido pelo contexto ativo.
- Helpers canônicos de cluster e lookup de unidades já resolvem tenant em multi-db quando a âncora ou unidade inequívoca está presente.

## 5. Híbridos controlados deixados de propósito

- pagesController.js permanece híbrido por compatibilidade de renderização e fallback legado isolado.
- api.db.js permanece híbrido porque ainda concentra helpers globais deliberados e compatibilidades residuais fora do caminho crítico já endurecido.

## 6. Suítes focais que sustentam o estado atual

- tests/gestor.requireUnitScope.test.js
- tests/gestor-unidades-unit-scope-canonical.test.js
- tests/gestor-unidades-writes-misc-unit-scope-canonical.test.js
- tests/gestor-setor-recurso-unit-scope-canonical.test.js

## 7. Riscos remanescentes

- Ainda existem usos de GLOBAL_SCOPE em api.db.js, mas agora majoritariamente concentrados em global deliberado ou compatibilidade residual.
- pagesController.js e api.db.js seguem como híbridos controlados; regressões futuras podem reabrir fail-open se novos fallbacks forem adicionados sem prova focal.
- A próxima redução da bridge precisa continuar evitando mudança de assinatura em cadeia e evitando reabrir a borda HTTP crítica.

## 8. Próxima fase prioritária

Continuar a redução residual da bridge helper por helper em api.db.js, escolhendo apenas helpers com call site vivo e impacto real em isolamento por unidade, sem mexer na borda HTTP crítica.

## 9. Regra operacional da próxima fase

- micro-patch único
- prova focal única
- sem reabrir middleware, rotas ou controllers críticos
- sem refactor amplo
- sem expandir escopo além do helper escolhido na rodada