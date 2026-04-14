# Checkpoint: Gestor Unidades Testar Banco Target Data Facade Decima Segunda Fatia Macro

## Snapshot

- Branch: migration/refactor-core
- HEAD: fb966c0
- Worktree: limpo antes da criacao deste checkpoint

## Familia consolidada

- Gestor Unidades testar banco target

## Fronteira provada

- service -> data facade -> repository
- controller, rota e contrato HTTP permanecem preservados

## Arquivos do recorte

- src/modules/gestor/app/data/unidades/unidadesTestarBancoTargetDataFacade.js
- src/modules/gestor/app/services/unidades/resolveTestarBancoTarget.service.js
- tests/gestor-unidades-testar-banco-structural-seam.test.js

## Guardrails preservados

- services do Gestor continuam sem importar repositories diretamente
- services do Gestor continuam sem importar db diretamente fora de legacy
- services do Gestor continuam sem importar usecases diretamente
- a seam publica do fluxo testar banco permaneceu estavel com o teste focal preservando a fronteira interna do service

## Motivo de parada

- Esta decima segunda fatia consolidou o corredor remanescente de Unidades testar banco target na fronteira canonica sem tocar em controller, rota, contrato HTTP, api.db.js, producao fora do recorte ou suite adicional.
- O service ficou reduzido a orquestracao minima de autorizacao target-aware e a nova facade concentrou as leituras canonicas de Unidade com helper de escopo e repositories explicitos.