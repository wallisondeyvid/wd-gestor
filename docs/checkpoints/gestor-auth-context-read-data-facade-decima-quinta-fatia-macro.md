# Checkpoint: Gestor Auth Context Read Data Facade Decima Quinta Fatia Macro

## Snapshot

- Branch: migration/refactor-core
- HEAD: 1a71872
- Worktree: limpo antes da criacao deste checkpoint

## Familia consolidada

- Auth context resolver read

## Fronteira provada

- service -> data facade -> repository
- controller, rota e contrato HTTP permanecem preservados

## Arquivos do recorte

- src/modules/gestor/app/data/auth/authContextReadDataFacade.js
- src/modules/gestor/app/services/authContextResolver.js
- tests/gestor-auth-context-resolver.test.js

## Guardrails preservados

- services do Gestor continuam sem importar repositories diretamente
- services do Gestor continuam sem importar usecases diretamente
- services do Gestor continuam sem importar db diretamente fora de legacy
- a seam publica do auth context resolver permaneceu estavel com o teste focal preservando feature flag, maxTimeMS, normalizacao e compatibilidade do contexto canonico

## Motivo de parada

- Esta decima quinta fatia consolidou a dependencia material remanescente da bridge no auth context resolver sem tocar em controller, rota, contrato HTTP, auth-context.db.js, producao fora do recorte ou suite adicional.
- O service ficou apenas reroteado para a facade de leitura e a nova facade concentrou as leituras canonicas de memberships e unidade com helper de escopo e repositories explicitos, preservando feature flag, maxTimeMS e o shape esperado pelo resolvedor.