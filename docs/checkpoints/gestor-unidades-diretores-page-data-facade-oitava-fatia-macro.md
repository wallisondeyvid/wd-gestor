# Checkpoint: Gestor Unidades Diretores Page Data Facade Oitava Fatia Macro

## Snapshot

- Branch: migration/refactor-core
- HEAD: 885d1b5
- Worktree: limpa antes da criacao deste checkpoint

## Familia consolidada

- Gestor Unidades diretores page read

## Fronteira provada

- service -> data facade -> repository
- controller, rota e contrato HTTP permanecem preservados

## Arquivos do recorte

- src/modules/gestor/app/data/unidades/unidadesDiretoresPageDataFacade.js
- src/modules/gestor/app/services/unidades/loadPaginaUnidadesDiretores.service.js
- tests/gestor-unidades-load-pagina-bundle-structural-seam.test.js

## Guardrails preservados

- services do Gestor continuam sem importar repositories diretamente
- services do Gestor continuam sem importar db diretamente fora de legacy
- services do Gestor continuam sem importar usecases diretamente
- seam publica do bundle de Unidades permanece estavel, sem exigir ajuste no teste focal

## Motivo de parada

- Esta oitava fatia moveu a leitura de diretores da pagina de Unidades para a fronteira canonica sem tocar em controller, rota, contrato HTTP, producao fora do recorte ou suite adicional.
- O proximo avanço exige nova leitura deliberada das familias remanescentes para escolher outro corredor minimo ainda preso a bridge, sem reabrir recortes ja consolidados.

## Proximo passo sugerido

- Abrir nova rodada estritamente de leitura para selecionar a proxima familia minima do Gestor que ainda use bridge como caminho material principal e ja tenha repository canonico explicito por baixo.