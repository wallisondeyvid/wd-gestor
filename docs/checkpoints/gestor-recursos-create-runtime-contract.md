# Checkpoint: Gestor Recursos Create Runtime Contract

Data: 2026-03-24
Escopo: caracterizacao runtime conservadora de POST /gestor/api/recursos
Suite focal: tests/gestor-recursos-create-runtime-contract.test.js
Execucao focal: node --test .\tests\gestor-recursos-create-runtime-contract.test.js
Resultado: 9 testes passando

## Snapshot operacional

- Branch: migration/refactor-core
- HEAD observado na abertura da rodada: bf3cd8c4e9db6229097012208e566d617d920f83
- Worktree ja estava sujo com artefatos nao rastreados anteriores de Recursos; nada foi limpo
- Sem patch de producao nesta rodada

## Wiring confirmado

- O corredor de API de Recursos continua montado via mount `app.use('/', recursoApiRouter)`
- A rota canonica desta subfase e `POST /gestor/api/recursos`
- A pagina correlata continua em `GET /gestor/recursos`

## Contrato observado

### Sem sessao

- `POST /gestor/api/recursos` no app real responde `401` JSON
- Envelope observado:

```json
{
  "success": false,
  "error": "Não autenticado",
  "code": "UNAUTHORIZED"
}
```

### Payload minimo invalido

- Se faltar qualquer campo obrigatorio entre `unidade_id`, `tipo`, `placa`, `chassi`, `renavam`, `ano`, `mod`, `marca`, `modelo` e `cor`, o owner responde `400`
- Nessa condicao, o owner nao consulta duplicidades nem tenta persistir
- Envelope observado:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "Todos os campos são obrigatórios"
}
```

### Bloqueio por contexto ausente

- Usuario nao privilegiado sem contexto canonico de unidade recebe `404`
- O owner nao consulta duplicidades nem tenta persistir
- Envelope observado:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Unidade não encontrada"
}
```

### Unidade alvo fora do escopo contextual

- Para usuario nao privilegiado, `requestedUnitMatchesContext` exige que `body.unidade_id` coincida com a unidade contextual canonica
- Se a unidade alvo estiver fora desse escopo, o owner responde `404`
- Envelope observado:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Unidade não encontrada"
}
```

### Validacao de placa

- O owner aceita apenas os formatos `ABC-1234` e `ABC-1D34`
- Para a persistencia e para a verificacao de duplicidade, placa e chassi sao convertidos para uppercase

### Duplicidade de placa

- O owner consulta `findRecursosByFiltroComUnidadeLean({ unidade_id, placa: placa.toUpperCase() })`
- Se houver conflito, responde `400`
- Envelope observado:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "Placa já cadastrada"
}
```

### Duplicidade de chassi

- Apos passar pela checagem de placa, o owner consulta `findRecursosByFiltroComUnidadeLean({ unidade_id, chassi: chassi.toUpperCase() })`
- Se houver conflito, responde `400` e interrompe antes da checagem de RENAVAM
- Envelope observado:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "Chassi já cadastrado"
}
```

### Duplicidade de RENAVAM

- Apos passar por placa e chassi, o owner consulta `findRecursosByFiltroComUnidadeLean({ unidade_id, renavam })`
- Se houver conflito, responde `400`
- Envelope observado:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "RENAVAM já cadastrado"
}
```

### Sucesso

- Em sucesso, o owner persiste payload normalizado com:
  - `unidade_id` normalizado
  - `placa` em uppercase
  - `chassi` em uppercase
  - `ano` e `mod` convertidos com `parseInt`
  - `ativo: true`
- O retorno observado usa `201` com envelope de created e payload bruto em `data`

```json
{
  "success": true,
  "created": true,
  "id": "507f1f77bcf86cd799439011",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "unidade_id": "507f191e810c19729de860ea",
    "tipo": "carro",
    "placa": "ABC-1D34",
    "chassi": "9BWZZZ377VT004251",
    "renavam": "12345678901",
    "ano": 2024,
    "mod": 2025,
    "marca": "Fiat",
    "modelo": "Argo",
    "cor": "Branco",
    "ativo": true
  }
}
```

### Erro interno

- Excecao interna em `createRecurso` cai no catch e responde `500`
- Envelope observado:

```json
{
  "success": false,
  "code": "SERVER_ERROR",
  "message": "forced-recursos-create-failure"
}
```

## Compatibilidade observada com consumer real

- O form em `views/gestor/recursos.ejs` aponta para `POST <basePath>/api/recursos`
- O script em `public/gestor/js/pages/recursos.js` usa `fetch(..., { method: 'POST', body: JSON.stringify(processedData) })`
- No front atual, o create considera sucesso apenas por `response.ok`; nao depende do shape do body de sucesso para concluir o cadastro

## Matriz coberta pela suite

- sem sessao no app real
- payload minimo invalido
- usuario nao privilegiado sem contexto canonico
- unidade fora do escopo contextual
- duplicidade de placa
- duplicidade de chassi
- duplicidade de RENAVAM
- sucesso com shape exato do payload
- erro interno induzido

## Decisao de congelamento

- O microcorte seguro `POST /gestor/api/recursos` ficou congelado com caracterizacao focal verde
- Nenhum passo de PUT ou DELETE foi aberto nesta rodada