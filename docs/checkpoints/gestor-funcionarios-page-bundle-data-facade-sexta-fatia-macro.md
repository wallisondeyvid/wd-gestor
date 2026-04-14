# Checkpoint: Gestor Funcionarios Page Bundle Data Facade Sexta Fatia Macro

## Snapshot

- Branch: migration/refactor-core
- HEAD: d8d3ac2
- Worktree: limpa antes da criacao deste checkpoint

## Familia escolhida

- Gestor Funcionarios page bundle

## Nova fronteira provada

- service -> data facade -> repository
- controller, rota e contrato HTTP permanecem preservados

## Arquivos do recorte

- src/modules/gestor/app/data/funcionarios/funcionariosPageBundleDataFacade.js
- src/modules/gestor/app/services/funcionarios/loadPaginaFuncionariosBundle.service.js
- tests/gestor-funcionarios-load-pagina-bundle-structural-seam.test.js

## Guardrails preservados

- services do Gestor continuam sem importar repositories diretamente
- services do Gestor continuam sem importar db diretamente fora de legacy
- services do Gestor continuam sem importar usecases diretamente
- tenant-aware routing continua abaixo do repository via unitScope e shared db

## Motivo de parada

- Esta sexta fatia moveu o bundle de pagina de Funcionarios para a fronteira canonica sem tocar em controller, rota ou contrato HTTP.
- O proximo avanço exige nova leitura deliberada das familias remanescentes para evitar abrir outro corredor fora do recorte minimo.

## Proximo passo sugerido

- Abrir uma nova rodada estritamente de leitura para selecionar a proxima familia minima que ainda use bridge como caminho material principal e ja tenha repository canonico explicito por baixo.