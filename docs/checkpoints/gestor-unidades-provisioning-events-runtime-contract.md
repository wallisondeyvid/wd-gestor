# Checkpoint: Gestor Unidades Provisioning Events Runtime Contract

Data: 2026-03-24
Branch: migration/refactor-core
HEAD: 4d8af986b9723991ef99f28a15e7b1fbe932bb06

## Escopo congelado

- `GET /gestor/api/unidades/:id/provisioning/events`

Sem reabrir:

- CRUD base de unidades
- logo/logo-inline
- endpoint público
- testar-banco
- toggle-access
- módulos por unidade
- provisioning status
- provisioning/retry
- frontend

## Arquivo focal

- Suíte: `tests/gestor-unidades-provisioning-events-runtime-contract.test.js`

Comando validado:

```powershell
node --test .\tests\gestor-unidades-provisioning-events-runtime-contract.test.js
```

Resultado observado: 8 testes passando, 0 falhando.

## Contrato congelado

### 1. Sem sessão

No app real, `GET /gestor/api/unidades/:id/provisioning/events` responde `401` JSON sem sessão:

```json
{
  "success": false,
  "error": "Não autenticado",
  "code": "UNAUTHORIZED"
}
```

### 2. ID inválido

O owner atual valida `id` vazio explicitamente após trim.

Quando `req.params.id` é vazio, responde `400` com:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "ID da unidade e obrigatorio."
}
```

### 3. Unidade inexistente

Quando `findUnidadeById(unidadeId)` não encontra a unidade, o owner responde `404`:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Unidade nao encontrada"
}
```

### 4. Fora do escopo contextual

O owner carrega primeiro a unidade e depois valida acesso por `ensureCanAccessUnidade(req, unidade._id)`.

Se o alvo não pertencer ao cluster acessível, responde `400`:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "Acesso a unidade nao autorizado"
}
```

### 5. Sucesso com eventos presentes

Quando a consulta retorna mais eventos do que o `limit`, o owner pede `limit + 1` ao serviço, corta o array e monta paginação.

Shape observado:

```json
{
  "success": true,
  "data": {
    "unidadeId": "u-filial",
    "filters": {
      "limit": 2,
      "scope": "module",
      "moduleKey": "ponto",
      "operation": "sync",
      "status": "success",
      "before": "2026-03-24T09:59:00.000Z|abcdefabcdefabcdefabcdef"
    },
    "pagination": {
      "hasMore": true,
      "nextBefore": "2026-03-24T10:02:00.000Z|bbbbbbbbbbbbbbbbbbbbbbbb"
    },
    "total": 2,
    "events": [
      {
        "eventId": "aaaaaaaaaaaaaaaaaaaaaaaa",
        "createdAt": "2026-03-24T10:03:00.000Z",
        "scope": "module",
        "moduleKey": "ponto",
        "operation": "sync",
        "status": "success"
      },
      {
        "eventId": "bbbbbbbbbbbbbbbbbbbbbbbb",
        "createdAt": "2026-03-24T10:02:00.000Z",
        "scope": "module",
        "moduleKey": "escalas",
        "operation": "sync",
        "status": "error"
      }
    ]
  }
}
```

### 6. Sucesso com eventos ausentes ou vazios

Quando `listUnitProvisioningAuditEvents(...)` devolve `[]`, o owner responde `200` com:

```json
{
  "success": true,
  "data": {
    "unidadeId": "u-sem-eventos",
    "filters": {
      "limit": 100,
      "scope": null,
      "moduleKey": null,
      "operation": null,
      "status": null,
      "before": null
    },
    "pagination": {
      "hasMore": false,
      "nextBefore": null
    },
    "total": 0,
    "events": []
  }
}
```

### 7. Shape exato do payload observado

O owner não devolve array simples. O shape real de sucesso é um objeto com:

- `unidadeId`
- `filters`
- `pagination`
- `total`
- `events`

O cenário abaixo do limite confirma que esse shape continua igual mesmo sem paginação adicional:

```json
{
  "success": true,
  "data": {
    "unidadeId": "u-shape",
    "filters": {
      "limit": 5,
      "scope": null,
      "moduleKey": null,
      "operation": null,
      "status": null,
      "before": null
    },
    "pagination": {
      "hasMore": false,
      "nextBefore": null
    },
    "total": 1,
    "events": [
      {
        "eventId": "aaaaaaaaaaaaaaaaaaaaaaaa",
        "createdAt": "2026-03-24T10:03:00.000Z",
        "scope": "unit",
        "moduleKey": null,
        "operation": "bootstrap",
        "status": "info"
      }
    ]
  }
}
```

### 8. Erro interno induzido

Quando `listUnitProvisioningAuditEvents` lança erro, o owner cai no `catch` externo e responde `500` com a mensagem original:

```json
{
  "success": false,
  "code": "SERVER_ERROR",
  "message": "forced-get-provisioning-events-failure"
}
```

## Observações importantes do runtime

- O gate sem sessão deste corredor é JSON `401`, não redirect.
- O owner valida `id` vazio explicitamente antes do lookup.
- A validação contextual acontece depois do lookup da unidade, usando `unidade._id`.
- O endpoint não devolve array simples nem paginação implícita: ele sempre devolve `filters`, `pagination`, `total` e `events`.
- O `limit` efetivamente enviado ao serviço é `limit + 1`, para detectar `hasMore`.
- `scope`, `operation` e `status` são normalizados para lowercase; `moduleKey` é trimado; `before` é normalizado para ISO e também lowercases o `eventId` quando presente.
- O fallback observável quando não há eventos é `events: []`, `total: 0`, `hasMore: false` e `nextBefore: null`.

## Decisão final

- Classificação: microcorte fechado com guardrail focal.
- Motivo: o gate de autenticação, a validação de id, o lookup da unidade, a validação contextual, a leitura dos eventos, o shape do payload de sucesso e o fallback observável foram congelados por suíte isolada sem abrir provisioning status nem retry.

## Confirmação explícita

- Produção não foi alterada.
- Controller não foi alterado.
- Route não foi alterada.
- Frontend não foi alterado.
- Testes antigos não foram alterados.
- Checkpoints antigos não foram alterados.
- Apenas a suíte focal nova e este checkpoint novo foram criados nesta rodada.