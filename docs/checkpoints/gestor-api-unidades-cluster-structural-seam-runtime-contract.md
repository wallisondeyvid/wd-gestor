# Checkpoint: Gestor API Unidades Cluster Structural Seam Runtime Contract

Data: 2026-03-25
Escopo: caracterizacao runtime conservadora apenas da nova costura estrutural de GET /gestor/api/unidades/cluster apos a reducao da bridge compat
Suite focal: tests/gestor-api-unidades-cluster-structural-seam-runtime-contract.test.js
Execucao focal: node --experimental-test-module-mocks --test .\tests\gestor-api-unidades-cluster-structural-seam-runtime-contract.test.js
Resultado: 2 testes passando

## Limite deliberado do microcorte

- Este checkpoint nao reabre o contrato funcional amplo de GET /gestor/api/unidades/cluster.
- Este checkpoint nao reabre auth/login/contexto nem os gates da borda anterior.
- O foco e somente a nova costura estrutural aplicada na fatia.

## Contrato observado

### Caminho principal do owner

- O owner `unidadesCluster` em src/modules/gestor/app/controllers/apiController.js passa a usar o service fino dedicado como caminho principal da leitura de cluster.
- No recorte validado, o owner resolve o anchor do cluster e chama o service com esse anchor resolvido.

### Caminho compat

- A funcao `findClusterUnidadesByAnchorLean` em src/modules/gestor/app/db/api.db.js permanece existente apenas como delegacao compat minima.
- No recorte validado, a chamada compat delega diretamente para o mesmo service fino, preservando retorno e assinatura publica.

## Matriz coberta pela suite

- o owner nao depende mais do caminho principal via apiDbBridgeService -> legacy/apiDbBridgeService -> api.db.js para executar a leitura de cluster
- api.db.js continua oferecendo a funcao compat, mas apenas como delegacao para o service fino

## Decisao final

- A lacuna de validacao executavel da nova costura estrutural estava real e ficou congelada localmente nesta rodada.
- A fatia de GET /gestor/api/unidades/cluster passa a ter prova focal tanto do contrato de borda anterior quanto da nova costura estrutural interna.