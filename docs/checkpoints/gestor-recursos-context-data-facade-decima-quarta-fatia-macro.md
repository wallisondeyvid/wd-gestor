# Checkpoint: Gestor Recursos Context Data Facade Decima Quarta Fatia Macro

## Snapshot

- Branch: migration/refactor-core
- HEAD: 51597f6
- Worktree: limpo antes da criacao deste checkpoint

## Familia consolidada

- Recursos listagem read scoped

## Fronteira provada

- service -> data facade -> repository
- controller, rota e contrato HTTP permanecem preservados

## Arquivos do recorte

- src/modules/gestor/app/data/recursos/recursosContextDataFacade.js
- src/modules/gestor/app/services/recursos/listarRecursos.service.js
- tests/gestor-recursos-list-structural-seam-runtime-contract.test.js

## Guardrails preservados

- services do Gestor continuam sem importar repositories diretamente
- services do Gestor continuam sem importar usecases diretamente
- services do Gestor continuam sem importar db diretamente fora de legacy
- a seam publica da listagem permaneceu estavel com o teste focal preservando o corredor estrutural e a compatibilidade via service fino

## Motivo de parada

- Esta decima quarta fatia consolidou a dependencia material remanescente da bridge na listagem de recursos sem tocar em controller, rota, contrato HTTP, api.db.js, producao fora do recorte ou suite adicional.
- O service ficou apenas reroteado para a facade de contexto e a nova facade concentrou as leituras canonicas de Unidade com helper de escopo e repositories explicitos, preservando a semantica de contexto e escopo da listagem.