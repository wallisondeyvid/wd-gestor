# Checkpoint: Gestor Funcoes Delete Runtime Contract

Data: 2026-03-24
Escopo: caracterizacao runtime conservadora de DELETE /gestor/api/funcoes/:id
Suite focal: tests/gestor-funcoes-delete-runtime-contract.test.js
Execucao focal: node --test .\tests\gestor-funcoes-delete-runtime-contract.test.js
Resultado: 6 testes passando

## Snapshot operacional

- Branch: migration/refactor-core
- HEAD observado na abertura da rodada: f153c8f2ecdc33b22b7fe4a8ac5e910ef4424f5f
- Worktree ja estava sujo apenas com artefatos locais novos de Funcoes; nada foi limpo
- Sem patch de producao nesta rodada

## Wiring confirmado

- O corredor de API de Funcoes continua montado via mount `app.use('/', funcaoApiRouter)`
- A rota canonica desta subfase e `DELETE /gestor/api/funcoes/:id`
- O consumer real mais direto desta rota e a acao `window.excluir(...)` em `views/gestor/funcoes.ejs`

## Contrato observado

### Sem sessao

- `DELETE /gestor/api/funcoes/:id` no app real responde `401` JSON
- Envelope observado:

```json
{
  "success": false,
  "error": "Não autenticado",
  "code": "UNAUTHORIZED"
}
```

### Lookup inicial do recurso

- O owner resolve a principal contextual quando `req.unitScope.unidadeId` existe e usa essa principal no lookup inicial de `findFuncaoById(id, principalContextual)`
- Sem contexto canonico, o lookup inicial usa `null`
- Se a funcao nao for encontrada nesse escopo efetivo, responde `404`
- Envelope observado:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Função não encontrada"
}
```

### Exclusao sem contexto canonico

- No owner isolado, sem `req.unitScope`, nao ha bloqueio por contexto ausente
- Nessa condicao, apos encontrar a funcao, a exclusao usa `normalizeUnitId(funcao.unidade_principal_id)` como segundo argumento de `deleteFuncaoById`

### Exclusao com contexto canonico

- Quando `req.unitScope.unidadeId` existe, o owner resolve a principal contextual e usa esse id tanto no lookup quanto na exclusao
- O runtime observado chama:

```json
deleteFuncaoById("<id>", "<principalContextual>")
```

### Sucesso

- Em sucesso, o owner responde `200` com envelope `success: true`
- O payload observado vem em `data` com:
  - `deleted: true`
  - `id` igual ao parametro da rota

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

- Excecao interna em `deleteFuncao` cai no catch e responde `500`
- Envelope observado:

```json
{
  "success": false,
  "code": "SERVER_ERROR",
  "message": "forced-funcoes-delete-failure"
}
```

## Compatibilidade observada com consumers reais

- A tela em `views/gestor/funcoes.ejs` chama `fetch(..., { method:'DELETE' })` e so verifica `r.ok` antes de recarregar a pagina
- O retorno observado `success: true, data: { deleted, id }` permanece compativel com esse consumer
- Em erro, a view tenta ler o corpo como texto e montar a mensagem; o envelope JSON observado continua legivel nesse caminho de falha
- Os consumers de Funcionarios nao dependem desta rota

## Matriz coberta pela suite

- sem sessao no app real
- recurso inexistente sem contexto canonico
- recurso inexistente no contexto canonico
- sucesso sem contexto usando a unidade da propria funcao
- sucesso com contexto usando a principal contextual
- erro interno induzido

## Decisao de congelamento

- O microcorte seguro `DELETE /gestor/api/funcoes/:id` ficou congelado com caracterizacao focal verde
- Nenhum passo de `POST /gestor/api/funcoes/bulk-update` foi aberto nesta rodada