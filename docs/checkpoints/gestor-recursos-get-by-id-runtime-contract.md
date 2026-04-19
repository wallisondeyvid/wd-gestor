# Checkpoint: Gestor Recursos Get By Id Runtime Contract

Data: 2026-03-24
Escopo: caracterizacao runtime conservadora de GET /gestor/api/recursos/:id
Suite focal: tests/gestor-recursos-get-by-id-runtime-contract.test.js
Execucao focal: node --test .\tests\gestor-recursos-get-by-id-runtime-contract.test.js
Resultado: 7 testes passando

## Snapshot operacional

- Branch: migration/refactor-core
- HEAD observado na abertura da rodada: bf3cd8c4e9db6229097012208e566d617d920f83
- Worktree ja estava sujo com artefatos nao rastreados anteriores de Recursos; nada foi limpo
- Sem patch de producao nesta rodada

## Wiring confirmado

- O corredor de API de Recursos continua montado via mount `app.use('/', recursoApiRouter)`
- A rota canonica desta subfase e `GET /gestor/api/recursos/:id`
- A pagina correlata continua em `GET /gestor/recursos`

## Contrato observado

### Sem sessao

- `GET /gestor/api/recursos/:id` no app real responde `401` JSON
- Envelope observado:

```json
{
  "success": false,
  "error": "Não autenticado",
  "code": "UNAUTHORIZED"
}
```

### ID invalido

- Quando `req.params.id` nao e um ObjectId hexadecimal de 24 caracteres, o owner responde `400`
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

- Na borda real, a rota passa por `requireUnitScope` antes do owner
- Usuario nao privilegiado sem contexto canonico de unidade recebe `400`
- O lookup do recurso nao e chamado porque o middleware aborta antes
- Envelope observado:

```json
{
  "success": false,
  "error": "UNIDADE_ID_REQUIRED"
}
```

### Lookup e escopo efetivo

- O owner deriva a unidade efetiva de `req.unitScope.unidadeId` ou fallback legado de sessao
- Usuario `admin` sem unidade contextual chama `findRecursoByIdComUnidadeNome(id, null)`
- Usuario nao privilegiado com contexto chama `findRecursoByIdComUnidadeNome(id, unidadeContextual)`
- Se o recurso nao for encontrado nesse escopo efetivo, o owner responde `404`
- Envelope observado:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Recurso não encontrado"
}
```

### Sucesso

- Em sucesso, o owner retorna `200` com envelope `success: true` e o payload bruto em `data`
- O shape observado e compativel com o consumer principal do Gestor e com o fallback colateral de Escalas

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "placa": "ABC-1D34",
    "tipo": "carro",
    "marca": "Fiat",
    "modelo": "Argo",
    "chassi": "9BWZZZ377VT004251",
    "renavam": "12345678901",
    "ano": 2024,
    "mod": 2025,
    "cor": "Branco",
    "ativo": true,
    "unidade_id": {
      "_id": "507f191e810c19729de860ea",
      "codigo": "M001",
      "nome": "Matriz Centro"
    }
  }
}
```

### Erro interno

- Excecao interna em `getRecurso` cai no catch e responde `500`
- Envelope observado:

```json
{
  "success": false,
  "code": "SERVER_ERROR",
  "message": "forced-recursos-get-failure"
}
```

## Compatibilidade observada com consumers reais

- A pagina Gestor em `public/gestor/js/pages/recursos.js` consome `raw.data || raw.recurso || raw` ao editar um recurso
- O fallback colateral em `public/escalas/js/modais_popups/recursos/modal_recurso.js` consome `js.data || js.recurso || js`
- Ambos permanecem compativeis com o envelope observado `success: true, data: recurso`

## Matriz coberta pela suite

- sem sessao no app real
- id invalido
- usuario nao privilegiado sem contexto canonico
- recurso inexistente para admin sem unidade efetiva
- recurso inexistente fora do escopo contextual efetivo
- sucesso com shape exato em `data`
- erro interno induzido

## Decisao de congelamento

- O microcorte seguro `GET /gestor/api/recursos/:id` ficou congelado com caracterizacao focal verde
- Nenhum passo de POST, PUT ou DELETE foi aberto nesta rodada