# Checkpoint: Gestor Recursos Update Runtime Contract

Data: 2026-03-24
Escopo: caracterizacao runtime conservadora de PUT /gestor/api/recursos/:id
Suite focal: tests/gestor-recursos-update-runtime-contract.test.js
Execucao focal: node --test .\tests\gestor-recursos-update-runtime-contract.test.js
Resultado: 11 testes passando

## Snapshot operacional

- Branch: migration/refactor-core
- HEAD observado na abertura da rodada: bf3cd8c4e9db6229097012208e566d617d920f83
- Worktree ja estava sujo com artefatos nao rastreados anteriores de Recursos; nada foi limpo
- Sem patch de producao nesta rodada

## Wiring confirmado

- O corredor de API de Recursos continua montado via mount `app.use('/', recursoApiRouter)`
- A rota canonica desta subfase e `PUT /gestor/api/recursos/:id`
- A pagina correlata continua em `GET /gestor/recursos`

## Contrato observado

### Sem sessao

- `PUT /gestor/api/recursos/:id` no app real responde `401` JSON
- Envelope observado:

```json
{
  "success": false,
  "error": "Não autenticado",
  "code": "UNAUTHORIZED"
}
```

### ID invalido

- Se `req.params.id` nao for ObjectId hexadecimal de 24 caracteres, o owner responde `400`
- O lookup do recurso nao e chamado
- Envelope observado:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "ID inválido"
}
```

### Bloqueio por contexto ausente

- Usuario nao privilegiado sem contexto canonico de unidade recebe `404`
- O owner nao consulta lookup nem persistencia
- Envelope observado:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Unidade não encontrada"
}
```

### Alvo fora do escopo contextual

- Para usuario nao privilegiado, `body.unidade_id` precisa coincidir com a unidade contextual canonica
- Se a unidade alvo estiver fora desse escopo, o owner responde `404`
- Envelope observado:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Unidade não encontrada"
}
```

### Payload minimo invalido

- No update, o minimo materializado pelo owner e `unidade_id`
- Se `unidade_id` faltar, o owner responde `400`
- Envelope observado:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "Unidade é obrigatória"
}
```

### Recurso inexistente

- Apos validar `unidade_id`, `req.params.id` e escopo contextual, o owner consulta `findRecursoByIdComUnidadeNome(id, unidadeEfetiva)`
- Se o recurso nao existir no escopo efetivo, responde `404`
- Envelope observado:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Recurso não encontrado"
}
```

### Validacao de placa

- Se `placa` vier no payload, o owner aceita apenas os formatos `ABC-1234` e `ABC-1D34`
- Na comparacao de update, placa e chassi sao convertidos para uppercase antes da persistencia

### Duplicidade de placa

- Se `placa` for diferente da atual, o owner consulta `findOutroRecursoByPlacaUpper(id, placa.toUpperCase(), unidadeEfetiva)`
- Se houver conflito, responde `400`
- Envelope observado:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "Placa já cadastrada para outro recurso"
}
```

### Duplicidade de chassi

- Se `chassi` for diferente do atual, o owner consulta `findOutroRecursoByChassiUpper(id, chassi.toUpperCase(), unidadeEfetiva)`
- Se houver conflito, responde `400` e interrompe antes do branch de RENAVAM
- Envelope observado:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "Chassi já cadastrado para outro recurso"
}
```

### Duplicidade de RENAVAM

- Se `renavam` for diferente do atual, o owner consulta `findOutroRecursoByRenavam(id, renavam, unidadeEfetiva)`
- Se houver conflito, responde `400`
- Envelope observado:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "RENAVAM já cadastrado para outro recurso"
}
```

### Sucesso

- Em sucesso, o owner chama `updateRecursoByIdComUnidadeNome(id, payloadNormalizado, unidadeEfetiva)`
- O payload persistido observado normaliza:
  - `placa` em uppercase quando enviada
  - `chassi` em uppercase quando enviado
  - `ano` e `mod` com `parseInt` quando enviados
  - `ativo` respeita `false` explicitamente quando enviado
- O retorno observado usa `200` com envelope `success: true` e payload bruto em `data`

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "unidade_id": "507f191e810c19729de860ea",
    "tipo": "carro",
    "placa": "ZZZ-9Z99",
    "chassi": "9BWZZZ377VT004252",
    "renavam": "10987654321",
    "ano": 2026,
    "mod": 2027,
    "marca": "Toyota",
    "modelo": "Corolla",
    "cor": "Preto",
    "ativo": false
  }
}
```

### Erro interno

- Excecao interna em `updateRecurso` cai no catch e responde `500`
- Envelope observado:

```json
{
  "success": false,
  "code": "SERVER_ERROR",
  "message": "forced-recursos-update-failure"
}
```

## Compatibilidade observada com consumer real

- O script em `public/gestor/js/pages/recursos.js` usa o mesmo submit do create, mas envia `PUT` quando `recursoId` esta preenchido
- O consumer considera sucesso apenas por `response.ok`; nao depende do body de sucesso para concluir a atualizacao
- O botao do formulario muda para `Atualizar Recurso` quando o detalhe foi carregado pelo GET por id

## Matriz coberta pela suite

- sem sessao no app real
- id invalido
- usuario nao privilegiado sem contexto canonico
- alvo fora do escopo contextual
- payload minimo invalido
- recurso inexistente
- duplicidade de placa
- duplicidade de chassi
- duplicidade de RENAVAM
- sucesso com shape exato do payload
- erro interno induzido

## Decisao de congelamento

- O microcorte seguro `PUT /gestor/api/recursos/:id` ficou congelado com caracterizacao focal verde
- Nenhum passo de DELETE foi aberto nesta rodada