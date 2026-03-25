# Checkpoint: Gestor Unidades Toggle Access Runtime Contract

Data: 2026-03-24
Branch: migration/refactor-core
HEAD: 4d8af986b9723991ef99f28a15e7b1fbe932bb06

## Escopo congelado

- `POST /gestor/api/unidades/toggle-access`

Sem reabrir:

- CRUD base de unidades
- logo/logo-inline
- endpoint público
- provisioning status/events/retry
- módulos por unidade
- frontend

## Arquivo focal

- Suíte: `tests/gestor-unidades-toggle-access-runtime-contract.test.js`

Comando validado:

```powershell
node --test .\tests\gestor-unidades-toggle-access-runtime-contract.test.js
```

Resultado observado: 8 testes passando, 0 falhando.

## Contrato congelado

### 1. Sem sessão

No app real, `POST /gestor/api/unidades/toggle-access` responde `401` JSON sem sessão:

```json
{
  "success": false,
  "error": "Não autenticado",
  "code": "UNAUTHORIZED"
}
```

### 2. Alvo inválido

O owner espera `req.body.unitIds` como array e `req.body.activate` como boolean.

Depois da normalização:

- `unitIds` é mapeado por `normalizeUnitId`
- valores falsy/brancos são descartados
- ids duplicados são removidos com `Set`

Se a lista resultante ficar vazia, o contrato atual responde `400`:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "Parâmetros inválidos."
}
```

### 3. Unidade inexistente

O owner não faz lookup explícito de existência por unidade-alvo.

No runtime do owner atual, quando o acesso passa e a mutação retorna `modifiedCount === 0`, o resultado observado é:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "Nenhuma unidade atualizada."
}
```

Esse é o comportamento congelado para o cenário caracterizado como unidade inexistente/sem atualização efetiva.

### 4. Fora do escopo contextual

O owner valida cada alvo por `ensureCanAccessUnidade(req, unitId)`.

Se qualquer item do lote estiver fora do cluster acessível do `unitScope`, a resposta é `400`:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "Acesso à unidade não autorizado."
}
```

### 5. Payload ausente ou inválido

Se `unitIds` não for array ou `activate` não for boolean, o owner responde `400`:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "Parâmetros inválidos."
}
```

### 6. Sucesso no caminho feliz

Quando o payload é válido, os alvos pertencem ao escopo acessível e a mutação retorna `modifiedCount > 0`, o owner responde `200` com envelope mínimo:

```json
{
  "success": true,
  "data": {
    "newStatus": true
  }
}
```

O sucesso observado congela apenas `newStatus`; o owner não retorna contagens, ids nem documentos atualizados.

### 7. Efeito observável da mutação no owner

Antes de chamar `updateManyUnidadesAccessByIds`, o owner:

- trimma ids
- remove ids vazios
- deduplica ids repetidos

Efeito congelado observado:

Entrada:

```json
{
  "unitIds": ["u-1", " u-1 ", "", "u-2", "u-2"],
  "activate": false
}
```

Chamada efetiva da mutação:

```json
{
  "unitIds": ["u-1", "u-2"],
  "activate": false
}
```

### 8. Erro interno induzido

Quando `updateManyUnidadesAccessByIds` lança erro, o owner cai no `catch` externo e responde `500` com a mensagem original:

```json
{
  "success": false,
  "code": "SERVER_ERROR",
  "message": "forced-toggle-access-failure"
}
```

## Observações importantes do runtime

- O gate sem sessão deste corredor é JSON `401`, não redirect.
- O owner não faz lookup explícito de existência das unidades-alvo; o cenário de inexistência se materializa como `Nenhuma unidade atualizada.` quando a mutação não modifica nada.
- A validação contextual é loteada: basta um alvo fora do escopo para o request inteiro falhar.
- O envelope de sucesso é deliberadamente enxuto: apenas `newStatus`.
- O efeito observável mais importante do owner é a coerção do payload antes da mutação: trim, filtro de vazios e deduplicação.

## Decisão final

- Classificação: microcorte fechado com guardrail focal.
- Motivo: o owner real, o gate de autenticação, a validação contextual, o payload esperado, o efeito observável da mutação e os envelopes de erro/sucesso foram congelados por suíte isolada sem abrir o restante do corredor.

## Confirmação explícita

- Produção não foi alterada.
- Controller não foi alterado.
- Route não foi alterada.
- Frontend não foi alterado.
- Testes antigos não foram alterados.
- Checkpoints existentes não foram alterados.
- Apenas a suíte focal nova e este checkpoint novo foram criados nesta rodada.