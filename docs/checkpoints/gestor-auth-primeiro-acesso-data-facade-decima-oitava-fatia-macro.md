# Checkpoint: Gestor Auth Primeiro Acesso Data Facade Decima Oitava Fatia Macro

## Snapshot

- Branch: migration/refactor-core
- HEAD: ad94510
- Worktree: limpo antes da criacao deste checkpoint

## Familia consolidada

- Auth primeiro acesso execution

## Fronteira provada

- service -> data facade -> repository
- controller, rota e contrato HTTP permanecem preservados

## Arquivos do recorte

- src/modules/gestor/app/data/auth/primeiroAcessoExecutionDataFacade.js
- src/modules/gestor/app/services/auth/primeiroAcessoExecution.service.js
- tests/gestor-auth-primeiro-acesso-post-structural-seam.test.js

## Guardrails preservados

- services do Gestor continuam sem importar repositories diretamente
- services do Gestor continuam sem importar usecases diretamente
- services do Gestor continuam sem importar db diretamente fora de legacy
- a seam publica do primeiro acesso permaneceu estavel com o teste focal preservando encaminhamento do owner, maxTimeMS, transicoes de estado not_found, already_completed, save_failed e updated

## Motivo de parada

- Esta decima oitava fatia consolidou a dependencia material remanescente da bridge no corredor de execucao de primeiro acesso sem tocar em controller, rota, contrato HTTP, auth.db.js, repositories fora do recorte ou suites adicionais.
- O service ficou apenas reroteado para a facade dedicada e a nova facade concentrou a leitura minima do usuario e a mutacao final de conclusao via repositories explicitos, preservando o fluxo de hash ja produzido pelo owner e o shape de resultado esperado pelo controller.