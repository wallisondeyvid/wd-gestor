# Checkpoint: Gestor Unidades Cluster Data Facade Quinta Fatia Macro

## Snapshot

- Branch: migration/refactor-core
- HEAD: 0585ce6
- Worktree: limpa antes da criacao deste checkpoint

## Familia escolhida

- Gestor Unidades cluster by anchor

## Nova fronteira provada

- service -> data facade -> repository
- controller, rota e contrato HTTP permanecem preservados

## Arquivos do recorte

- src/modules/gestor/app/data/unidades/unidadesClusterDataFacade.js
- src/modules/gestor/app/services/unidades/findClusterUnidadesByAnchor.service.js
- tests/gestor-api-unidades-cluster-structural-seam-runtime-contract.test.js

## Guardrails preservados

- services do Gestor continuam sem importar repositories diretamente
- services do Gestor continuam sem importar db diretamente fora de legacy
- services do Gestor continuam sem importar usecases diretamente
- tenant-aware routing continua abaixo do repository via unitScope e shared db

## Motivo de parada

- Esta quinta fatia moveu a leitura de cluster por anchor para a fronteira canonica sem tocar em controller, rota, contrato HTTP ou compatibilidade externa.
- O proximo avanço exige nova leitura deliberada das familias remanescentes para escolher outro corredor minimo fora dos recortes ja consolidados.

## Proximo passo sugerido

- Abrir uma nova rodada estritamente de leitura para selecionar a proxima familia minima que ainda use bridge como caminho material principal e ja tenha repository canonico explicito por baixo.