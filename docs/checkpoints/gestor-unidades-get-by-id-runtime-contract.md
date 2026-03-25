# Checkpoint: Gestor Unidades Get By Id Runtime Contract

Data: 2026-03-24
Branch: migration/refactor-core
HEAD: 4d8af986b9723991ef99f28a15e7b1fbe932bb06

## Escopo congelado

- GET /gestor/api/unidades/:id

Sem reabrir:

- GET /gestor/api/unidades ja congelado
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

- Suite: tests/gestor-unidades-get-by-id-runtime-contract.test.js

Comando validado:

```powershell
node --test .\tests\gestor-unidades-get-by-id-runtime-contract.test.js
```

Resultado observado: 8 testes passando, 0 falhando.

## Snapshot e wiring confirmado

- No sub-app real, o mount das APIs de unidades permanece via unidadeApiRouter em src/modules/gestor/app/gestor-app.js.
- A rota focal permanece registrada como GET /api/unidades/:id com withLoginAndRequiredUnitScope em src/modules/gestor/app/routes/unidadeApi.js.
- O consumer de pagina ligado ao corredor de edicao permanece em src/modules/gestor/app/routes/pagesRouter.js via GET /editar-unidades/:id.

## Contrato congelado

### 1. Sem sessao no app real

No app real, GET /gestor/api/unidades/:id responde 401 em JSON sem sessao:

```json
{
  "success": false,
  "error": "Não autenticado",
  "code": "UNAUTHORIZED"
}
```

### 2. Id vazio ou invalido

O owner atual nao possui validacao sintatica explicita de id antes do lookup.

Quando req.params.id esta vazio, o runtime observado ainda chama findUnidadeById('') e, sem alvo resolvido, responde 404:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Unidade não encontrada"
}
```

### 3. Unidade inexistente

Quando findUnidadeById(unidadeId) nao encontra a unidade, o owner responde 404 com o mesmo envelope:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Unidade não encontrada"
}
```

### 4. Fora do escopo contextual

O owner primeiro faz o lookup da unidade alvo e so depois valida acesso via ensureCanAccessUnidade(req, unidade._id).

Se o alvo nao pertencer ao cluster acessivel do unitScope, a resposta observada e 400:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "Acesso à unidade não autorizado"
}
```

### 5. Sucesso com unidade encontrada

No caminho feliz observado, o owner responde 200 com envelope success/data e um payload plano, sem agregadores adicionais:

```json
{
  "success": true,
  "data": {
    "_id": "u-centro",
    "codigo": "UNI-001",
    "nome": "Clinica Centro",
    "razaoSocial": "Clinica Centro LTDA",
    "cnpj": "12345678000190",
    "cpf": "",
    "pessoaTipo": "J",
    "inscricaoEstadual": "12345",
    "inscricaoMunicipal": "67890",
    "cnaePrincipal": "8630501",
    "cnaeSecundarios": ["8650001"],
    "regimeTributario": "Simples",
    "naturezaJuridica": "2062",
    "is_principal": false,
    "subunidade": true,
    "unidade_principal_id": "u-principal",
    "dataAbertura": "2024-01-10",
    "telefoneFixo": "1133334444",
    "telefoneCelular": "1199998888",
    "emailPrincipal": "contato@centro.test",
    "emailFiscal": "fiscal@centro.test",
    "site": "https://centro.test",
    "banco": "001",
    "agencia": "1234",
    "contaCorrente": "99999-0",
    "pixChave": "pix@centro.test",
    "tipoPix": "email",
    "modulosAcessiveis": ["ponto", "escalas"],
    "diretor_usuario_id": "dir-salvo",
    "endereco": { "cidade": "São Paulo", "uf": "SP" },
    "logo": null,
    "apiBancaria": {}
  }
}
```

### 6. Shape exato do payload retornado

O shape observado do payload de sucesso e exatamente um objeto plano com estes campos:

- _id
- codigo
- nome
- razaoSocial
- cnpj
- cpf
- pessoaTipo
- inscricaoEstadual
- inscricaoMunicipal
- cnaePrincipal
- cnaeSecundarios
- regimeTributario
- naturezaJuridica
- is_principal
- subunidade
- unidade_principal_id
- dataAbertura
- telefoneFixo
- telefoneCelular
- emailPrincipal
- emailFiscal
- site
- banco
- agencia
- contaCorrente
- pixChave
- tipoPix
- modulosAcessiveis
- diretor_usuario_id
- endereco
- logo
- apiBancaria

O owner nao reduz esse payload para um shape menor nem envolve com metadados adicionais alem de success/data.

### 7. Sanitizacao observavel de apiBancaria

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

### 8. Fallback observavel de diretor

O owner aplica um fallback apenas quando:

- unidade.is_principal e true
- unidade.diretor_usuario_id esta ausente

Nesse caso, tenta resolver o diretor por findDiretorAtivoByUnidadeSelectId(unidade._id).

Efeito observado:

```json
{
  "diretor_usuario_id": "dir-fallback"
}
```

Se o fallback nao resolver nada, o payload permanece com diretor_usuario_id null.

### 9. Normalizacao de campos observaveis

As normalizacoes observadas neste owner sao pontuais:

- logo cai para null quando unidade.logo vier falsy
- diretor_usuario_id cai para null quando nao houver valor salvo nem fallback resolvido
- apiBancaria null/ausente sai como {}

Nao ficou observada normalizacao adicional de modulosAcessiveis ou cnaeSecundarios neste owner: esses campos saem como vierem do documento.

### 10. Erro interno induzido

Quando findUnidadeById lanca erro, o owner cai no catch externo e responde 500 com a mensagem original:

```json
{
  "success": false,
  "code": "SERVER_ERROR",
  "message": "forced-get-by-id-failure"
}
```

## Observacoes importantes do runtime

- O gate sem sessao deste corredor e JSON 401, nao redirect.
- Diferente de getUnidadeModulos, este owner faz o lookup da unidade primeiro e so depois valida o acesso contextual pelo _id resolvido.
- O owner nao valida id vazio explicitamente; o comportamento para id vazio ou invalido decorre do proprio lookup falhando em encontrar a unidade.
- O payload de sucesso e um objeto plano relativamente amplo, nao um shape reduzido.
- O fallback de diretor existe apenas para unidade principal sem diretor_usuario_id salvo e nao muda o contrato de erro: falha do fallback apenas gera warn e o fluxo continua.
- A sanitizacao de apiBancaria e parcial de leitura: remove apiMtlsCertFileData, mas preserva os demais campos.

## Decisao final

- Classificacao: proxima subfase aberta com guardrail focal fechado.
- Motivo: o runtime atual de GET /gestor/api/unidades/:id foi caracterizado por suite isolada, cobrindo gate real, lookup, validacao contextual, shape de payload, fallback de diretor, sanitizacao e erro interno sem patch de producao.

## Confirmacao explicita

- Producao nao foi alterada.
- Frontend nao foi alterado.
- Testes antigos nao foram alterados.
- Checkpoints existentes nao foram alterados.
- Nao foram reabertos PUT, POST ou DELETE.
- Nao foram reabertos logo/logo-inline.
- Nao foi reaberto endpoint publico.
- Nao foram reabertos toggle-access ou provisioning.
- Nao foi reaberto GET /gestor/api/unidades ja congelado.
- Apenas a suite focal nova e este checkpoint novo foram criados nesta rodada.