# Checkpoint: Gestor Unidades List Runtime Contract

Data: 2026-03-24
Branch: migration/refactor-core
HEAD: 4d8af986b9723991ef99f28a15e7b1fbe932bb06

## Escopo congelado

- GET /gestor/api/unidades

Sem reabrir:

- GET por id
- POST
- PUT
- DELETE
- logo/logo-inline
- endpoint publico
- toggle-access
- provisioning status/events/retry
- testar-banco
- frontend

## Arquivo focal

- Suite: tests/gestor-unidades-list-runtime-contract.test.js

Comando validado:

```powershell
node --test .\tests\gestor-unidades-list-runtime-contract.test.js
```

Resultado observado: 9 testes passando, 0 falhando.

## Snapshot e wiring confirmado

- No sub-app real, o mount de APIs de unidades permanece via unidadeApiRouter em src/modules/gestor/app/gestor-app.js.
- A rota focal permanece registrada como GET /api/unidades com withLoginAndRequiredUnitScope em src/modules/gestor/app/routes/unidadeApi.js.
- O consumer de pagina ligado a /unidades permanece em src/modules/gestor/app/routes/pagesRouter.js via GET /unidades.

## Contrato congelado

### 1. Sem sessao no app real

No app real, GET /gestor/api/unidades responde 401 em JSON sem sessao:

```json
{
  "success": false,
  "error": "Não autenticado",
  "code": "UNAUTHORIZED"
}
```

### 2. Sucesso com lista vazia

Quando req.app.locals.skipDb esta ligado, o owner retorna 200 com envelope de sucesso e arrays vazios:

```json
{
  "success": true,
  "data": {
    "unidades": [],
    "principalUnits": []
  }
}
```

### 3. Sucesso com unidades retornadas

No caminho feliz observado do owner, o retorno e 200 com envelope de sucesso e agregador em data:

```json
{
  "success": true,
  "data": {
    "unidades": [
      {
        "_id": "u-principal",
        "nome": "Clinica Matriz",
        "is_principal": true,
        "subunidade": false,
        "naturezaJuridica": "",
        "modulosAcessiveis": ["financeiro"],
        "apiBancaria": {
          "apiBaseUrl": "https://bank.example.test",
          "apiOauthScope": "scope-a"
        }
      },
      {
        "_id": "u-filial",
        "nome": "Clinica Filial",
        "is_principal": false,
        "subunidade": true,
        "naturezaJuridica": "",
        "modulosAcessiveis": ["ponto", "escalas"],
        "apiBancaria": {}
      }
    ],
    "principalUnits": [
      {
        "_id": "u-principal",
        "nome": "Clinica Matriz",
        "is_principal": true,
        "subunidade": false,
        "naturezaJuridica": "",
        "modulosAcessiveis": ["financeiro"],
        "apiBancaria": {
          "apiBaseUrl": "https://bank.example.test",
          "apiOauthScope": "scope-a"
        }
      }
    ]
  }
}
```

### 4. Shape exato de data.unidades

Cada item de data.unidades preserva o documento base e aplica as normalizacoes observadas desta linha:

- naturezaJuridica cai para string vazia quando ausente
- modulosAcessiveis sai como array
- apiBancaria sai como objeto sanitizado

Shape minimo congelado por item:

- _id
- nome
- is_principal
- subunidade
- naturezaJuridica
- modulosAcessiveis
- apiBancaria

### 5. Shape exato de data.principalUnits

data.principalUnits devolve um subconjunto de data.unidades, sem shape alternativo nem agregador proprio.

O shape observado dos itens e o mesmo de data.unidades.

### 6. Sanitizacao observavel de apiBancaria

O owner passa apiBancaria por buildApiBancariaForResponse.

Comportamento congelado:

- apiMtlsCertFileData nao e exposto na resposta
- demais campos presentes sao preservados
- quando apiBancaria vier null/ausente, a saida observada e {}

Exemplo observado:

```json
{
  "apiBaseUrl": "https://bank.example.test",
  "apiMtlsCertFileName": "certificado.p12"
}
```

### 7. Normalizacao observavel de modulosAcessiveis

O owner normaliza modulosAcessiveis assim:

- se o valor ja for array, preserva o array
- se o valor nao for array, responde []

Exemplo observado:

Entrada interna:

```json
"modulosAcessiveis": "financeiro"
```

Saida observada:

```json
"modulosAcessiveis": []
```

### 8. Derivacao e fallback de principalUnits

Ordem observada de derivacao:

1. Filtra por is_principal truthy
2. Se vazio e houver scopedContext.principalUnitId, filtra pelo _id igual a principalUnitId
3. Se ainda vazio e houver scopedContext.scopedUnitId, filtra pelo _id igual a scopedUnitId
4. Se ainda vazio, infere por subunidade === false ou subunidade === 'false'

Fallbacks congelados por evidencia:

- principalUnitId sem flag is_principal ainda seleciona a unidade principal correspondente
- scopedUnitId cai para a propria unidade do escopo quando principalUnitId nao existir
- sem ids de referencia, subunidade false ou 'false' define a principal legacy

### 9. Erro interno induzido

Quando uma excecao e lancada dentro do owner, o catch nao responde 500.

O contrato atual observado fecha em 200 com sucesso vazio:

```json
{
  "success": true,
  "data": {
    "unidades": [],
    "principalUnits": []
  }
}
```

## Observacoes importantes do runtime

- O gate sem sessao deste corredor e JSON 401, nao redirect.
- O owner tem um ramo explicito de skipDb que evita 500 e devolve arrays vazios.
- data.unidades e data.principalUnits vivem sempre sob o envelope success/data; o endpoint nao devolve array na raiz.
- principalUnits nao tem shape proprio: ele reaproveita o mesmo shape ja serializado de unidades.
- apiBancaria tem sanitizacao parcial de leitura: remove apiMtlsCertFileData, mas nao reduz o objeto a um subconjunto menor alem disso.
- O catch externo do owner e fail-soft: loga o erro e ainda responde sucesso com listas vazias.

## Decisao final

- Classificacao: subfase 1 aberta com guardrail focal fechado.
- Motivo: o runtime atual de GET /gestor/api/unidades foi caracterizado por suite isolada, cobrindo gate real, envelopes, shapes, sanitizacao, normalizacao, fallback e erro interno sem patch de producao.

## Confirmacao explicita

- Producao nao foi alterada.
- Frontend nao foi alterado.
- Testes antigos nao foram alterados.
- Checkpoints existentes nao foram alterados.
- Apenas a suite focal nova e este checkpoint novo foram criados nesta rodada.