# Checkpoint: Assembleias Execution Presence Context Runtime Contract

Data: 2026-03-25
Escopo: caracterizacao runtime conservadora apenas de POST /condominios/api/assembleias/:id/execution/presence no corredor V2, focando no contrato contextual minimo do write
Suite focal: tests/assembleias-execution-presence-context-runtime-contract.test.js
Execucao focal: node --test .\tests\assembleias-execution-presence-context-runtime-contract.test.js
Resultado: 2 testes passando

## Wiring confirmado

- O mount real do modulo continua em src/modules/condominios/assembleias/index.js.
- Com ASSEMBLEIAS_V2 ligado, o mount usa executionV2().
- A rota canonica do recorte e POST /condominios/api/assembleias/:id/execution/presence.
- No caminho V2, o owner real e executionPresenceLogic, chamado pelo handler em src/modules/condominios/assembleias/v2/routes/execution.routes.js.

## Limite deliberado do microcorte

- Este checkpoint nao reabre o fluxo amplo end-to-end ja coberto em tests/assembleia_execution_flow.test.js.
- Este checkpoint nao abre outro endpoint do corredor de assembleias.
- O foco e somente a exigencia contextual minima do write de presence.

## Contrato observado

### Caminho negado

- Um request para POST /condominios/api/assembleias/:id/execution/presence com header x-wdg-portal=1, mas sem contexto autenticado correspondente, e recusado.
- O contrato HTTP observado foi:

```json
{
  "ok": false,
  "error": "Não autenticado"
}
```

### Caminho permitido

- Um request para o mesmo endpoint com sessao autenticada de gestor continua aceito mesmo quando o request envia x-wdg-portal=1 e nao ha portalUser dedicado no recorte focal.
- O payload observado continua suficiente para o fluxo posterior, com presenceId e key retornados.

## Matriz coberta pela suite

- o write exige autenticacao minima e nao aceita apenas o header x-wdg-portal isolado
- o write continua funcional com sessao de gestor autenticada no recorte em que o header x-wdg-portal esta presente
- a suite complementa a cobertura ampla sem reexecutar votacao, ata e fechamento de sessao

## Decisao final

- O gap contextual minimo de POST /condominios/api/assembleias/:id/execution/presence estava real e ficou congelado localmente neste microcorte.
- Nenhum outro endpoint ou corredor foi aberto nesta rodada.