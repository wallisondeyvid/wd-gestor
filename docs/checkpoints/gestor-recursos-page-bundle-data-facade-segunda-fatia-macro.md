# Checkpoint: Gestor Recursos Page Bundle Data Facade Segunda Fatia Macro

## Snapshot

- Branch: migration/refactor-core
- HEAD: 0d72321
- Worktree: limpa

## Familia escolhida

- Gestor Recursos page bundle

## Nova fronteira provada

- service -> data facade -> repository
- bridge e api.db.js permanecem fora do recorte como compatibilidade preservada

## Arquivos do recorte

- src/modules/gestor/app/services/recursos/loadPaginaRecursosBundle.service.js
- src/modules/gestor/app/data/recursos/recursosPageBundleDataFacade.js

## Guardrails preservados

- services do Gestor continuam sem importar repositories diretamente
- services do Gestor continuam sem importar db diretamente fora de legacy
- tenant-aware routing continua abaixo do repository via shared db

## Motivo de parada

- Esta segunda fatia moveu o bundle de pagina de Recursos para a fronteira canonica sem tocar em controller, rota ou contrato HTTP.
- O proximo passo exige nova comparacao deliberada entre familias remanescentes para evitar abrir frente proibida ou reabrir corredores ja consolidados.

## Proximo passo sugerido

- Reavaliar uma proxima familia pequena que ainda use bridge como caminho material principal e ja tenha repository canonico explicito por baixo, fora de Funcoes e fora de Recursos bundle.