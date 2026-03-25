# Checkpoint: Gestor Recursos Delete Runtime Contract

Data: 2026-03-24
Escopo: caracterizacao runtime conservadora de DELETE /gestor/api/recursos/:id
Suite focal: tests/gestor-recursos-delete-runtime-contract.test.js
Execucao focal: node --test .\tests\gestor-recursos-delete-runtime-contract.test.js
Resultado: 7 testes passando

## Snapshot operacional

- Branch: migration/refactor-core
- HEAD observado na abertura da rodada: bf3cd8c4e9db6229097012208e566d617d920f83
- Worktree ja estava sujo com artefatos nao rastreados anteriores de Recursos; nada foi limpo
- Sem patch de producao nesta rodada

## Wiring confirmado

- O corredor de API de Recursos continua montado via mount `app.use('/', recursoApiRouter)`
- A rota canonica desta subfase e `DELETE /gestor/api/recursos/:id`
- A pagina correlata continua em `GET /gestor/recursos`

## Contrato observado

### Sem sessao

- `DELETE /gestor/api/recursos/:id` no app real responde `401` JSON
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
- A exclusao escopada nao e chamada
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
- A exclusao escopada nao e chamada
- Envelope observado:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Unidade não encontrada"
}
```

### Recurso inexistente

- O owner resolve a unidade efetiva via contexto canonico ou `null` para admin sem unidade contextual
- Depois chama `deleteRecursoById(id, unidadeEfetiva)`
- Se nada for excluido no escopo efetivo, responde `404`
- Envelope observado:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Recurso não encontrado"
}
```

### Alvo fora do escopo contextual

- Para usuario nao privilegiado com contexto, o comportamento observavel e exclusao escopada com `deleteRecursoById(id, unidadeContextual)`
- Se o recurso estiver fora desse escopo efetivo, a exclusao retorna nulo e o owner responde `404 Recurso não encontrado`

### Exclusao no escopo efetivo

- Para admin sem unidade contextual, o owner chama `deleteRecursoById(id, null)`
- Para usuario contextual, o owner chama `deleteRecursoById(id, unidadeContextual)`
- Em sucesso, o owner responde `200` com envelope `success: true` e payload em `data`

```json
{
  "success": true,
  "data": {
    "deleted": true,
    "id": "507f1f77bcf86cd799439011"
  }
}
```

### Erro interno

- Excecao interna em `deleteRecurso` cai no catch e responde `500`
- Envelope observado:

```json
{
  "success": false,
  "code": "SERVER_ERROR",
  "message": "forced-recursos-delete-failure"
}
```

## Compatibilidade observada com consumer real

- A view em `views/gestor/recursos.ejs` expoe um modal de confirmacao dedicado para exclusao
- O script em `public/gestor/js/pages/recursos.js` chama `fetch(..., { method: 'DELETE' })`
- No front atual, o delete considera sucesso apenas por `response.ok`; nao depende do body de sucesso para concluir a exclusao

## Matriz coberta pela suite

- sem sessao no app real
- id invalido
- usuario nao privilegiado sem contexto canonico
- recurso inexistente
- alvo fora do escopo contextual
- sucesso com shape exato do payload
- erro interno induzido
- comportamento observavel quando a exclusao e chamada no escopo efetivo

## Decisao de congelamento

- O microcorte seguro `DELETE /gestor/api/recursos/:id` ficou congelado com caracterizacao focal verde
- O corredor CRUD principal de Recursos ficou integralmente caracterizado nesta trilha