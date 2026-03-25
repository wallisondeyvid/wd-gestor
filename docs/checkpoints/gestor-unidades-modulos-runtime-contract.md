# Checkpoint: Gestor Unidades Modulos Runtime Contract

Data: 2026-03-24
Branch: migration/refactor-core
HEAD: 4d8af986b9723991ef99f28a15e7b1fbe932bb06

## Escopo congelado

- `GET /gestor/api/unidades/:id/modulos`

Sem reabrir:

- CRUD base de unidades
- logo/logo-inline
- endpoint público
- provisioning status/events/retry
- testar-banco
- toggle-access
- frontend

## Arquivo focal

- Suíte: `tests/gestor-unidades-modulos-runtime-contract.test.js`

Comando validado:

```powershell
node --test .\tests\gestor-unidades-modulos-runtime-contract.test.js
```

Resultado observado: 8 testes passando, 0 falhando.

## Contrato congelado

### 1. Sem sessão

No app real, `GET /gestor/api/unidades/:id/modulos` responde `401` JSON sem sessão:

```json
{
  "success": false,
  "error": "Não autenticado",
  "code": "UNAUTHORIZED"
}
```

### 2. ID inválido

O owner atual não tem validação sintática explícita de `id`.

No runtime observado, quando o acesso é permitido e `findUnidadeByIdWithModulosAcessiveis(id)` não resolve o alvo, o resultado é `404`:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Unidade não encontrada"
}
```

### 3. Unidade inexistente

Quando o lookup final por `findUnidadeByIdWithModulosAcessiveis(id)` não encontra a unidade, o owner responde `404` com o mesmo envelope:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Unidade não encontrada"
}
```

### 4. Fora do escopo contextual

O owner chama `ensureCanAccessUnidade(req, req.params.id)` antes do lookup final da unidade.

Se o alvo não pertencer ao cluster acessível do `unitScope`, a resposta é `400`:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "Acesso à unidade não autorizado"
}
```

### 5. Sucesso com módulos

Quando a unidade existe e possui `modulosAcessiveis`, o owner retorna `200` com array mapeado para um shape reduzido:

```json
{
  "success": true,
  "data": [
    {
      "_id": "m-1",
      "nome": "Ponto",
      "status": "active"
    },
    {
      "_id": "m-2",
      "nome": "Escalas",
      "status": false
    }
  ]
}
```

O owner não devolve outros campos do módulo além de `_id`, `nome` e `status`.

### 6. Sucesso sem módulos

Quando `modulosAcessiveis` existe como array vazio, o owner responde `200` com:

```json
{
  "success": true,
  "data": []
}
```

### 7. Shape exato do payload observado

O payload de sucesso é sempre um array no envelope `data`, não um objeto agregador.

Shape reduzido de cada item:

- `_id`
- `nome`
- `status`

Fallback observado:

- se `unidade.modulosAcessiveis` não existir, o owner cai para `[]`

Ou seja, o comportamento observado é:

```json
{
  "success": true,
  "data": []
}
```

### 8. Erro interno induzido

Quando `findUnidadeByIdWithModulosAcessiveis` lança erro, o owner cai no `catch` externo e responde `500` com a mensagem original:

```json
{
  "success": false,
  "code": "SERVER_ERROR",
  "message": "forced-get-modulos-failure"
}
```

## Observações importantes do runtime

- O gate sem sessão deste corredor é JSON `401`, não redirect.
- A validação contextual acontece antes do lookup final da unidade.
- O owner não normaliza o payload para um objeto com metadados; ele retorna diretamente um array no `data`.
- O shape dos módulos é explicitamente reduzido para `_id`, `nome` e `status`, descartando quaisquer outros campos do documento original.
- Quando não há módulos, ou quando o campo `modulosAcessiveis` está ausente, o fallback observado é array vazio.

## Decisão final

- Classificação: microcorte fechado com guardrail focal.
- Motivo: o gate de autenticação, a validação de escopo, o comportamento do lookup, o shape do payload de sucesso e o fallback para array vazio foram congelados por suíte isolada sem abrir o restante do corredor.

## Confirmação explícita

- Produção não foi alterada.
- Controller não foi alterado.
- Route não foi alterada.
- Frontend não foi alterado.
- Testes antigos não foram alterados.
- Checkpoints antigos não foram alterados.
- Apenas a suíte focal nova e este checkpoint novo foram criados nesta rodada.