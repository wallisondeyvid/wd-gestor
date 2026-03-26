# Checkpoint: Condominios Blocos PUT Global Scope Runtime Contract

Data: 2026-03-25
Escopo: caracterizacao runtime conservadora apenas de PUT /condominios/api/blocos/:id no corredor V2 quando requireUnitScope resolve unitScope global com enforce=false
Suite focal: tests/condominios-blocos-put-global-scope-runtime-contract.test.js
Execucao focal: node --experimental-test-module-mocks --test .\tests\condominios-blocos-put-global-scope-runtime-contract.test.js
Resultado: 2 testes passando

## Wiring confirmado

- O mount real continua no sub-app de condominios em src/modules/condominios/app/condominios-app.js.
- A rota canonica do recorte e PUT /condominios/api/blocos/:id.
- No caminho V2, o owner real e handlePutBlocosV2 em src/modules/condominios/app/v2/routes/blocos.routes.js.
- O middleware real encadeado nessa rota e requireUnitScope do proprio modulo Condomínios.
- O service efetivo do write e atualizarBlocoService.

## Limite deliberado do microcorte

- Este checkpoint nao abre DELETE.
- Este checkpoint nao reabre a matriz ampla de leituras, V1, nem o caso com unidade valida ja coberto pela suite ampla anterior.
- O foco e somente o caso sem unidade valida no request, com enforce=false, para verificar se o write V2 ainda tenta seguir com scope global ou se o service agora o bloqueia no ponto minimo decidido.

## Contrato observado

### Middleware

- Em PUT /api/blocos/:id sem unidade valida no request e com WDG_MULTI_TENANT desabilitado para enforcement, requireUnitScope nao bloqueia o fluxo.
- O runtime observado no proprio middleware foi:

```json
{
  "type": "global",
  "unidadeId": null
}
```

### Owner + service

- Com esse scope global, handlePutBlocosV2 repassa unitScope ao service sem normalizar para unidade.
- atualizarBlocoService agora faz a guarda minima no proprio path de update e recusa qualquer scope que nao seja `unit` antes de construir BlocosRepository.
- No recorte validado, com scope global, o repositorio nao e construido e nenhum update por id e executado.

- O payload HTTP observado no handler focal passou a ser 400 com o erro coerente do corredor:

```json
{
  "success": false,
  "error": "UNIDADE_ID_REQUIRED"
}
```

## Matriz coberta pela suite

- requireUnitScope resolve unitScope global em PUT de blocos com enforce=false e sem unidade valida
- PUT V2 ainda recebe unitScope global ate o service
- o service recusa o write antes da criacao de BlocosRepository quando unitScope nao e `unit`
- nenhum updateById e executado no contrato focal validado

## Decisao final

- O middleware continua podendo resolver unitScope global com enforce=false neste recorte.
- A correcao minima aplicada no path de service impede que PUT /condominios/api/blocos/:id siga para o repositorio quando o scope nao e `unit`.
- Nenhum outro endpoint ou corredor foi aberto nesta rodada.