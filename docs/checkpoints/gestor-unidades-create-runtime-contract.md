# Checkpoint: Gestor Unidades Create Runtime Contract

Data: 2026-03-24
Escopo: caracterizacao runtime conservadora de POST /gestor/api/unidades
Suite focal: tests/gestor-unidades-create-runtime-contract.test.js
Execucao focal: node --test .\tests\gestor-unidades-create-runtime-contract.test.js
Resultado: 8 testes passando

## Snapshot operacional

- Branch: migration/refactor-core
- HEAD observado na abertura da rodada: 4d8af986b9723991ef99f28a15e7b1fbe932bb06
- Sem patch de producao nesta rodada
- Sem alteracoes em suites antigas ou checkpoints antigos

## Contrato observado

### Sem sessao

- POST /gestor/api/unidades no app real responde 401 JSON
- Envelope observado:

```json
{
  "success": false,
  "error": "Não autenticado",
  "code": "UNAUTHORIZED"
}
```

### Validacoes iniciais e contextualizacao

- Payload minimo invalido com usuario admin responde 400 BAD_REQUEST com a mensagem `Nome Fantasia e e-mail principal são obrigatórios e válidos.`
- Quando `subunidade=true` e nao existe principal resolvida, o owner responde 400 BAD_REQUEST com `Uma subunidade deve ter uma unidade principal associada.`
- Quando a principal solicitada nao pertence ao escopo contextual do usuario, o owner responde 400 BAD_REQUEST com `Acesso à unidade não autorizado.`

### Duplicidade relevante

- Para criacao PJ, se `findUnidadeByCnpj` encontra unidade existente, o owner responde 400 BAD_REQUEST com `CNPJ já cadastrado no banco de dados.`

### Sucesso como unidade principal

- O owner gera o proximo codigo sequencial observado a partir de `findUltimaUnidadePorCodigo`; no caso caracterizado, `M0007 -> M0008`
- `modulosAcessiveis` escalar e normalizado para array
- `apiBancaria` e saneada antes da persistencia e no retorno:
  - trim em `apiBaseUrl`
  - trim em `apiMtlsCertFileName`
  - `tipoAutenticacaoAPI` invalido cai para string vazia
- O payload interno preserva `dataAbertura` como Date; a resposta HTTP serializa para ISO string
- Quando a unidade criada e principal e existe `diretor_usuario_id`, o owner executa o vinculo via `updateUserUnidadeById`
- O side effect de provisioning e observavel em sucesso com chamada no formato:

```json
{
  "unidadeId": "u-principal-nova",
  "tipo": "principal",
  "modulosHabilitados": ["financeiro"]
}
```

- O envelope de sucesso observado inclui `created: true` alem de `success: true`:

```json
{
  "success": true,
  "created": true,
  "id": "u-principal-nova",
  "data": {
    "_id": "u-principal-nova",
    "codigo": "M0008"
  }
}
```

### Sucesso como subunidade

- Para subunidade PJ, o owner deriva o CNPJ a partir da base da principal e do proximo sufixo disponivel
- No caso caracterizado, a principal tinha base `12345678` e a nova subunidade recebeu o CNPJ derivado calculado para o sufixo `0002`
- O payload persistido marca:
  - `is_principal: false`
  - `subunidade: true`
  - `unidade_principal_id` preenchido
  - `diretor_usuario_id: null`
- O provisioning de subunidade e chamado com `tipo: subunidade`

### Erro interno

- Se uma excecao escapa do owner, o catch responde 500 com `SERVER_ERROR` e preserva a mensagem original observavel
- Caso induzido: `forced-create-failure`

## Matriz coberta pela suite

- sem sessao no app real
- payload minimo invalido
- subunidade sem principal resolvida
- duplicidade relevante de CNPJ
- principal solicitada fora do escopo contextual
- sucesso como principal com normalizacao de `apiBancaria` e `modulosAcessiveis`
- sucesso como subunidade com CNPJ derivado e provisioning
- erro interno induzido

## Observacoes de implementacao da caracterizacao

- A suite usa o mesmo harness conservador das rodadas anteriores: app real apenas para o caso sem sessao e invocacao direta do owner para os demais cenarios
- As dependencias de bridge e provisioning foram interceptadas por loader hook apenas dentro da suite nova
- Nenhum arquivo de producao foi alterado para viabilizar a caracterizacao