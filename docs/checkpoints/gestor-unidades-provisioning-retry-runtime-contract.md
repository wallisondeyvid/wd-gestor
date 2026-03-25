# Checkpoint: Gestor Unidades Provisioning Retry Runtime Contract

Data: 2026-03-24
Branch: migration/refactor-core
HEAD: 4d8af986b9723991ef99f28a15e7b1fbe932bb06

## Escopo congelado

- `POST /gestor/api/unidades/:id/provisioning/retry`

Sem reabrir:

- CRUD base de unidades
- logo/logo-inline
- endpoint público
- testar-banco
- toggle-access
- módulos por unidade
- provisioning status
- provisioning/events
- frontend

## Arquivo focal

- Suíte: `tests/gestor-unidades-provisioning-retry-runtime-contract.test.js`

Comando validado:

```powershell
node --test .\tests\gestor-unidades-provisioning-retry-runtime-contract.test.js
```

Resultado observado: 8 testes passando, 0 falhando.

## Contrato congelado

### 1. Sem sessão

No app real, `POST /gestor/api/unidades/:id/provisioning/retry` responde `401` JSON sem sessão:

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

### 5. Sucesso no retry

Quando o retry é aceito pelo serviço, o owner responde `200` com o payload devolvido por `retryUnitProvisioning(...)` dentro de `data`.

Shape observado no caminho feliz:

```json
{
  "success": true,
  "data": {
    "retried": true,
    "accepted": true
  }
}
```

Além disso, a chamada ao serviço observada foi:

```json
{
  "unidadeId": "u-filial",
  "tipo": "filial",
  "modulosHabilitados": ["ponto", "escalas"],
  "modulosRetry": ["ponto", "escalas", "financeiro"]
}
```

### 6. Shape exato do payload observado

O owner não inventa job id, fila, polling, status assíncrono nem metadados adicionais.

Quando o serviço devolve payload mínimo, o contrato observado é mínimo:

```json
{
  "success": true,
  "data": {
    "accepted": true
  }
}
```

Ou seja, o owner apenas envelopa o retorno do serviço com `ok(res, retryResult)`.

### 7. Fallback observável

Dois fallbacks observáveis ficaram congelados:

- `tipo` é derivado por `resolveTipoUnidadeProvisionada(unidade)`:
  - principal -> `principal`
  - subunidade -> `subunidade`
  - caso contrário -> `filial`

- Se `unidade.modulosAcessiveis` não for array e não houver parâmetros de retry, a chamada ao serviço cai para arrays vazios:

```json
{
  "unidadeId": "u-sem-modulos",
  "tipo": "subunidade",
  "modulosHabilitados": [],
  "modulosRetry": []
}
```

O payload de sucesso correspondente observado foi:

```json
{
  "success": true,
  "data": {
    "retried": true
  }
}
```

Também ficou congelado o merge/normalização de módulos de retry:

- aceita fontes em `body` e `query`
- split por vírgula
- trim de tokens
- remove vazios
- deduplica preservando a primeira ocorrência

### 8. Erro interno induzido

Quando `retryUnitProvisioning` lança erro genérico, o owner cai no `catch` externo e responde `500` com a mensagem original:

```json
{
  "success": false,
  "code": "SERVER_ERROR",
  "message": "forced-provisioning-retry-failure"
}
```

## Observações importantes do runtime

- O gate sem sessão deste corredor é JSON `401`, não redirect.
- O owner valida `id` vazio explicitamente antes do lookup.
- A validação contextual acontece depois do lookup da unidade, usando `unidade._id`.
- O owner não fabrica metadados de retry; ele apenas repassa o retorno do serviço dentro de `data`.
- O fallback observável mais importante é a composição do payload de retry:
  - `tipo` derivado da unidade
  - `modulosHabilitados` caindo para `[]`
  - `modulosRetry` vindo da fusão normalizada de múltiplas chaves de body/query

## Decisão final

- Classificação: microcorte fechado com guardrail focal.
- Motivo: o gate de autenticação, a validação de id, o lookup da unidade, a validação contextual, a chamada ao retry, o payload mínimo observado e os fallbacks atuais foram congelados por suíte isolada sem reabrir status nem events.

## Confirmação explícita

- Produção não foi alterada.
- Controller não foi alterado.
- Route não foi alterada.
- Frontend não foi alterado.
- Testes antigos não foram alterados.
- Checkpoints antigos não foram alterados.
- Apenas a suíte focal nova e este checkpoint novo foram criados nesta rodada.