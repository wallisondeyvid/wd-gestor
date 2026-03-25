# Checkpoint: Gestor Unidades Update Runtime Contract

Data: 2026-03-24
Branch: migration/refactor-core
HEAD: 4d8af986b9723991ef99f28a15e7b1fbe932bb06

## Escopo congelado

- PUT /gestor/api/unidades/:id

Sem reabrir:

- GET /gestor/api/unidades
- GET /gestor/api/unidades/:id
- POST
- DELETE
- logo/logo-inline
- endpoint publico
- toggle-access
- provisioning status/events/retry
- testar-banco
- frontend

## Arquivo focal

- Suite: tests/gestor-unidades-update-runtime-contract.test.js

Comando validado:

```powershell
node --test .\tests\gestor-unidades-update-runtime-contract.test.js
```

Resultado observado: 7 testes passando, 0 falhando.

## Snapshot e wiring confirmado

- No sub-app real, o mount das APIs de unidades permanece via unidadeApiRouter em src/modules/gestor/app/gestor-app.js.
- A rota focal permanece registrada como PUT /api/unidades/:id com withLoginAndRequiredUnitScope em src/modules/gestor/app/routes/unidadeApi.js.
- Os consumers de página adjacentes de Unidades permanecem em src/modules/gestor/app/routes/pagesRouter.js via GET /unidades e GET /editar-unidades/:id.

## Contrato congelado

### 1. Sem sessao no app real

No app real, PUT /gestor/api/unidades/:id responde 401 em JSON sem sessao:

```json
{
  "success": false,
  "error": "Não autenticado",
  "code": "UNAUTHORIZED"
}
```

### 2. Id vazio ou invalido conforme o runtime real

O owner atual nao possui validacao sintatica explicita de id antes do lookup.

Quando req.params.id esta vazio, o runtime observado ainda chama findUnidadeById('') e, sem alvo resolvido, responde 404:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Unidade não encontrada."
}
```

### 3. Unidade inexistente

Quando findUnidadeById(unidadeId) nao encontra a unidade, o owner responde 404 com o mesmo envelope:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Unidade não encontrada."
}
```

### 4. Fora do escopo contextual

O owner primeiro faz o lookup da unidade alvo e so depois valida acesso via ensureCanAccessUnidade(req, unidadeExistente._id).

Se o alvo nao pertencer ao cluster acessivel do unitScope, a resposta observada e 400:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "Acesso à unidade não autorizado."
}
```

### 5. Sucesso minimo com update escalar observavel

No caminho feliz observado, o owner:

- normaliza nomeFantasia para nome
- normaliza subunidade de string para boolean
- deriva is_principal como subunidade === false
- preserva diretor_usuario_id da unidade existente
- preserva logo da unidade existente
- normaliza modulosAcessiveis para array
- saneia apiBancaria antes da mutacao

Envelope observado de sucesso:

```json
{
  "success": true,
  "data": {
    "updated": true,
    "unidade": {
      "_id": "u-edit",
      "nome": "Clinica Renovada",
      "razaoSocial": "Clinica Renovada LTDA",
      "cnpj": "12345678000195",
      "cpf": null,
      "pessoaTipo": "pj",
      "dataAbertura": "2024-02-03T00:00:00.000Z",
      "inscricaoEstadual": "12345",
      "inscricaoMunicipal": "67890",
      "cnaePrincipal": "8630501",
      "cnaeSecundarios": ["8650001"],
      "regimeTributario": "Simples",
      "naturezaJuridica": "2062",
      "tipoLogradouro": null,
      "logradouro": null,
      "numero": null,
      "complemento": null,
      "bairro": null,
      "cep": null,
      "cidade": null,
      "estado": null,
      "codigoIbgeMunicipio": null,
      "telefoneFixo": "1133334444",
      "telefoneCelular": "1199998888",
      "emailPrincipal": "contato@renovada.test",
      "emailFiscal": "fiscal@renovada.test",
      "site": "https://renovada.test",
      "banco": "001",
      "agencia": "1234",
      "contaCorrente": "99999-0",
      "pixChave": "pix@renovada.test",
      "tipoPix": "email",
      "modulosAcessiveis": ["financeiro"],
      "diretor_usuario_id": "dir-existente",
      "is_principal": false,
      "subunidade": true,
      "unidade_principal_id": "u-principal",
      "endereco": { "cidade": "Sao Paulo", "uf": "SP" },
      "apiBancaria": {},
      "logo": "https://cdn.example.test/logo-antiga.webp"
    }
  }
}
```

### 6. Shape do payload de sucesso

O owner nao retorna documento cru na raiz. O shape observado de sucesso e sempre:

- success true
- data.updated true
- data.unidade como objeto serializado da unidade atualizada

Ou seja, o contrato de sucesso e um agregador em data, nao um objeto de unidade solto.

### 7. Comportamento observavel de apiBancaria

O owner passa req.body.apiBancaria por sanitizeApiBancariaInput antes da mutacao e por buildApiBancariaForResponse na resposta.

Comportamento congelado observado:

- strings sao trimadas
- campos vazios sao descartados
- tipoAutenticacaoAPI fora do conjunto permitido vira string vazia
- apiMtlsCertFileData nao e exposto na resposta

Exemplo observado:

Entrada efetiva salva:

```json
{
  "apiBaseUrl": "https://bank.example.test",
  "tipoAutenticacaoAPI": "",
  "apiMtlsCertFileName": "certificado.p12",
  "apiMtlsPassword": "segredo"
}
```

Saida observada:

```json
{
  "apiBaseUrl": "https://bank.example.test",
  "tipoAutenticacaoAPI": "",
  "apiMtlsCertFileName": "certificado.p12",
  "apiMtlsPassword": "segredo"
}
```

Sem apiMtlsCertFileData.

### 8. Comportamento observavel de modulosAcessiveis

O owner normaliza modulosAcessiveis assim:

- se o valor ja for array, preserva o array
- se o valor vier escalar truthy, converte para array com um item
- se vier falsy, devolve array vazio

Exemplo observado:

Entrada:

```json
"modulosAcessiveis": "financeiro"
```

Mutacao e resposta observadas:

```json
"modulosAcessiveis": ["financeiro"]
```

### 9. Preservacao de logo quando o recorte nao abre upload

O owner nao zera a logo no update comum.

Antes da mutacao, ele reaplica:

```json
"logo": unidadeExistente.logo || null
```

E o payload de sucesso observado preserva essa mesma logo.

### 10. Campos booleanos e escalares relevantes

Normalizacoes observadas no owner:

- is_principal: subunidade === 'false'
- subunidade: subunidade === 'true'
- unidade_principal_id: principal efetivo resolvido quando subunidade e true; caso contrario, null
- nome: derivado de nomeFantasia
- dataAbertura: parseada para Date internamente e serializada como ISO na resposta
- campos escalares ausentes caem majoritariamente para null no objeto atualizado

### 11. Regras de principal/subunidade que entram no owner

O owner resolve unidadePrincipal por resolveRequestedPrincipalUnitId.

Quando subunidade === 'true', ele:

- reaproveita a principal existente como fallback quando cabivel
- exige que a principal efetiva esteja no escopo acessivel
- exige que o documento da principal exista e tenha is_principal true

Se essa resolucao falhar, o contrato atual fecha em 400 com Acesso à unidade não autorizado. ou Unidade principal inválida., conforme o ramo atingido.

### 12. Envelope de erro

Os envelopes observados neste owner incluem:

- 404 not found com code NOT_FOUND e message Unidade não encontrada.
- 400 bad request contextual com code BAD_REQUEST e message Acesso à unidade não autorizado.
- 500 server error com code SERVER_ERROR e a mensagem original do erro capturado

### 13. Erro interno induzido

Quando findUnidadeById lanca erro, o owner cai no catch externo e responde 500 com a mensagem original:

```json
{
  "success": false,
  "code": "SERVER_ERROR",
  "message": "forced-update-failure"
}
```

## Observacoes importantes do runtime

- O gate sem sessao deste corredor e JSON 401, nao redirect.
- O owner faz o lookup da unidade antes da validacao contextual, em linha com GET por id e DELETE.
- O owner nao valida id vazio explicitamente; o comportamento para id vazio decorre do lookup falhar.
- O payload de sucesso e um agregador com data.updated e data.unidade, nao um documento simples nem um envelope minimo como no DELETE.
- A normalizacao de modulosAcessiveis no update difere do GET list: no PUT, escalar truthy vira array com um item; no GET list, valor nao-array cai para [].
- A preservacao de logo e explicita no owner de update, evitando apagar a logo quando este corredor nao abre upload.
- apiBancaria tem dupla transformacao: saneamento de entrada e sanitizacao de leitura na resposta.

## Decisao final

- Classificacao: proxima subfase aberta com guardrail focal fechado.
- Motivo: o runtime atual de PUT /gestor/api/unidades/:id foi caracterizado por suite isolada, cobrindo gate real, lookup, validacao contextual, normalizacao de payload, apiBancaria, modulosAcessiveis, preservacao de logo, shape de sucesso e erro interno sem patch de producao.

## Confirmacao explicita

- Producao nao foi alterada.
- Frontend nao foi alterado.
- Testes antigos nao foram alterados.
- Checkpoints antigos nao foram alterados.
- Apenas a suite focal nova e este checkpoint novo foram criados nesta rodada.