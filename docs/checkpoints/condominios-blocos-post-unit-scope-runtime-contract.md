# Checkpoint: Condominios Blocos POST Unit Scope Runtime Contract

Data: 2026-04-19
Escopo: microcorte conservador apenas de POST /condominios/api/blocos no alinhamento OFF/ON da bifurcacao
Suite focal: tests/condominios.blocos.microcut.test.js
Execucao focal: node --test .\tests\condominios.blocos.microcut.test.js

## Wiring confirmado

- O mount real continua no sub-app de condominios em src/modules/condominios/app/condominios-app.js.
- A rota canonica do recorte e POST /condominios/api/blocos.
- No caminho V2, o owner real e handlePostBlocosV2 em src/modules/condominios/app/v2/routes/blocos.routes.js.
- No caminho OFF, o handler V1 do POST agora e preparado pela mesma costura local de requireUnitScope antes de chamar o service.
- O middleware real encadeado nessa rota e requireUnitScope do proprio modulo Condomínios.
- O service efetivo do write e criarBlocoService.

## Contrato congelado

### Borda real

- No app real com V2 ligado, POST /condominios/api/blocos com unidade valida continua atravessando a borda V2 sem falhar por escopo antes do owner.
- No app real com V2 desligado, POST /condominios/api/blocos com unidade valida passa a atravessar a mesma preparacao de unitScope antes do handler V1.
- Com skipDb ligado, o contrato observado permanece 503 com erro de indisponibilidade de banco.

### Source of scope autoritativo

- No corredor V2, handlePostBlocosV2 passa req.unitScope ao service.
- No corredor OFF alinhado, o handler V1 passa req.unitScope ao mesmo service.
- criarBlocoService passou a tratar req.unitScope como fonte autoritativa de escopo.
- body.unidade_id deixou de ser a fonte primaria para construcao do BlocosRepository.

### Validacao do body

- body.unidade_id continua presente como dado explicito do request.
- Quando body.unidade_id diverge de req.unitScope.unidadeId, o owner responde 400 com:

```json
{
  "success": false,
  "error": "UNIDADE_ID_MISMATCH"
}
```

- Nesse ramo, o repositorio nao e construido e nenhuma escrita e executada.

### Caminho feliz minimo

- Quando req.unitScope e unit e body.unidade_id coincide com a unidade efetiva, o repositorio nasce do req.unitScope.
- O lookup de idempotencia e a criacao passam a usar a mesma unidade efetiva contextual.

## Decisao final

- O microcorte de POST /condominios/api/blocos ficou alinhado entre OFF e ON no ponto local de preparacao de unitScope.
- O corredor continua sem reabrir GET list, GET by id, PUT ou DELETE.
- O service permanece como fronteira autoritativa de source-of-scope.
- Residuo remanescente apos este corte: ainda sobra o eixo de observacao de paridade ampla do corredor de blocos, sem reabrir writes laterais nesta rodada.