# Checkpoint: Gestor Funcoes Read Data Facade Primeira Fatia Macro

## Snapshot

- Branch: migration/refactor-core
- HEAD: 80ef66b
- Worktree: limpa

## Familia escolhida

- Gestor Funcoes read-by-filter

## Nova fronteira provada

- service -> data facade -> repository
- api.db.js permanece apenas como compat shell para os helpers publicos de filtro

## Arquivos do recorte

- src/modules/gestor/app/services/funcoes/listarFuncoes.service.js
- src/modules/gestor/app/data/funcoes/funcoesReadDataFacade.js
- src/modules/gestor/app/data/funcoes/funcoesScope.js
- src/modules/gestor/app/db/api.db.js
- tests/gestor-funcoes-list-structural-seam-runtime-contract.test.js

## Guardrails preservados

- services do Gestor continuam sem importar repositories diretamente
- services do Gestor continuam sem importar db diretamente fora de legacy
- tenant-aware routing continua abaixo do repository via shared db

## Motivo de parada

- Esta primeira fatia provou a nova fronteira em uma familia pequena sem reabrir contrato HTTP.
- O proximo passo exige nova comparacao deliberada entre familias remanescentes para evitar cortes cosmeticos ou reabertura de frentes congeladas.

## Proximo passo sugerido

- Reavaliar uma proxima familia pequena em que o service ainda use a bridge como caminho material, mas ja exista repository canonico explicito por baixo.