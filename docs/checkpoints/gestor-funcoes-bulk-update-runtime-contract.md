# Checkpoint: Gestor Funcoes Bulk Update Runtime Contract

Data: 2026-03-24
Escopo: caracterizacao runtime conservadora de POST /gestor/api/funcoes/bulk-update
Suite focal: tests/gestor-funcoes-bulk-update-runtime-contract.test.js
Execucao focal: node --test .\tests\gestor-funcoes-bulk-update-runtime-contract.test.js
Resultado: 6 testes passando

## Snapshot operacional

- Branch: migration/refactor-core
- HEAD observado na abertura da rodada: f153c8f2ecdc33b22b7fe4a8ac5e910ef4424f5f
- Worktree ja estava sujo apenas com artefatos locais novos de Funcoes; nada foi limpo
- Sem patch de producao nesta rodada

## Wiring confirmado

- O corredor de API de Funcoes continua montado via mount `app.use('/', funcaoApiRouter)`
- A rota canonica desta subfase e `POST /gestor/api/funcoes/bulk-update`
- Nao foi observado consumer direto desta rota no recorte autorizado de frontend; a tela principal de Funcoes usa create, get-by-id, update e delete unitarios

## Contrato observado

### Sem sessao

- `POST /gestor/api/funcoes/bulk-update` no app real responde `401` JSON
- Envelope observado:

```json
{
  "success": false,
  "error": "Não autenticado",
  "code": "UNAUTHORIZED"
}
```

### Lista vazia

- Se `req.body.itens` nao vier como array com pelo menos um elemento, o owner responde `400`
- Envelope observado com mensagem `Lista vazia`

### Contexto canonico

- Quando `req.unitScope.unidadeId` existe, o owner resolve a principal contextual e usa esse id no lookup de cada item
- Nessa condicao, itens cujo documento exista mas esteja fora da principal contextual sao tratados como `Nao encontrada`
- Diferente de create/update unitarios, nao ha uma validacao separada de unidade-alvo por body; o escopo do bulk vem do lookup contextual de cada id

### Processamento item a item

- O owner percorre `itens` em ordem e acumula `results`
- Para item sem `_id` ou `id`, retorna:

```json
{ "ok": false, "motivo": "Sem _id" }
```

- Para item nao encontrado no escopo efetivo, retorna:

```json
{ "_id": "<id>", "ok": false, "motivo": "Nao encontrada" }
```

- Para item encontrado, o owner marca `changed = true` apenas se:
  - `nome` vier preenchido e diferente do nome atual
  - `descricao` vier definida e diferente da descricao atual

- Se `changed` for verdadeiro, o owner persiste o proprio documento mutado com `saveFuncao(f)` e incrementa `updated`
- Se `changed` for falso, o item retorna `ok: true, changed: false` sem persistencia

### Atualizacao de descricao vazia

- `descricao: ''` enviada explicitamente e tratada como update valido quando diverge do valor atual
- Isso gera `changed: true` e persistencia com a string vazia

### Sucesso

- Em sucesso, o owner responde `200` com envelope `success: true`
- O payload observado vem em `data` com:
  - `updated`: quantidade de itens efetivamente persistidos
  - `results`: array de resultados por item, preservando a ordem de entrada

```json
{
  "success": true,
  "data": {
    "updated": 1,
    "results": [
      { "ok": false, "motivo": "Sem _id" },
      { "_id": "missing-id", "ok": false, "motivo": "Nao encontrada" },
      { "_id": "507f1f77bcf86cd799439011", "ok": true, "changed": true },
      { "_id": "507f1f77bcf86cd799439012", "ok": true, "changed": false }
    ]
  }
}
```

### Erro interno

- Excecao interna em `bulkUpdateFuncoes` cai no catch e responde `500`
- Envelope observado:

```json
{
  "success": false,
  "code": "SERVER_ERROR",
  "message": "forced-funcoes-bulk-update-failure"
}
```

## Compatibilidade observada com consumers reais

- No recorte autorizado nao foi observado consumer frontend direto chamando `POST /api/funcoes/bulk-update`
- O shape observado e autocontido para consumo administrativo: resumo agregado em `updated` e granularidade por item em `results`
- Os consumers de Funcionarios nao dependem desta rota

## Matriz coberta pela suite

- sem sessao no app real
- lista vazia
- processamento misto sem contexto canonico
- escopo contextual tratando item fora da principal como `Nao encontrada`
- atualizacao explicita de `descricao` para string vazia
- erro interno induzido

## Decisao de congelamento

- O microcorte seguro `POST /gestor/api/funcoes/bulk-update` ficou congelado com caracterizacao focal verde
- Nenhum outro endpoint fora de `POST /gestor/api/funcoes/bulk-update` foi aberto nesta rodada