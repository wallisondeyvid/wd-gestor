# Checkpoint: Gestor Funcoes Get By Id Runtime Contract

Data: 2026-03-24
Escopo: caracterizacao runtime conservadora de GET /gestor/api/funcoes/:id
Suite focal: tests/gestor-funcoes-get-by-id-runtime-contract.test.js
Execucao focal: node --test .\tests\gestor-funcoes-get-by-id-runtime-contract.test.js
Resultado: 7 testes passando

## Snapshot operacional

- Branch: migration/refactor-core
- HEAD observado na abertura da rodada: f153c8f2ecdc33b22b7fe4a8ac5e910ef4424f5f
- Worktree ja estava sujo apenas com artefatos locais novos de Funcoes; nada foi limpo
- Sem patch de producao nesta rodada

## Wiring confirmado

- O corredor de API de Funcoes continua montado via mount `app.use('/', funcaoApiRouter)`
- A rota canonica desta subfase e `GET /gestor/api/funcoes/:id`
- O consumer real mais direto desta rota e a tela de Funcoes em modo edicao, via `window.editar(...)`

## Contrato observado

### Sem sessao

- `GET /gestor/api/funcoes/:id` no app real responde `401` JSON
- Envelope observado:

```json
{
  "success": false,
  "error": "Não autenticado",
  "code": "UNAUTHORIZED"
}
```

### Lookup sem contexto efetivo

- Para admin sem contexto canonico, o owner chama `findFuncaoByIdPopulated(id, null)`
- Se o recurso nao for encontrado, responde `404`
- Envelope observado:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Função não encontrada"
}
```

### Lookup com contexto efetivo

- Quando `req.unitScope.unidadeId` existe, o owner resolve a principal contextual e chama `findFuncaoByIdPopulated(id, principalContextual)`
- Se a funcao nao for encontrada nesse escopo efetivo, responde `404`
- Envelope observado:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Função não encontrada"
}
```

### Owner isolado sem contexto canonico

- No owner isolado, sem `req.unitScope`, nao ha bloqueio por contexto ausente
- Nessa condicao, o lookup usa unidade nula: `findFuncaoByIdPopulated(id, null)`
- Se nao encontrar, responde o mesmo `404 NOT_FOUND`

### Sucesso

- Em sucesso, o owner retorna `200` com envelope `success: true` e payload normalizado em `data`
- O shape observado e:

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "nome": "Supervisor",
    "descricao": "Coordena equipe",
    "unidade_principal_id": "507f191e810c19729de860ea",
    "modulos_habilitados": [
      { "_id": "m-1", "nome": "Dashboard" },
      { "_id": "m-2", "nome": "Funcionarios" }
    ]
  }
}
```

- Normalizacoes observadas no owner:
  - `descricao` cai para string vazia quando ausente
  - `unidade_principal_id` sai como id simples quando existe populate
  - `unidade_principal_id` sai `null` quando ausente
  - `modulos_habilitados` sai como array de objetos `{ _id, nome }`

### Erro interno

- Excecao interna em `getFuncao` cai no catch e responde `500`
- Envelope observado:

```json
{
  "success": false,
  "code": "SERVER_ERROR",
  "message": "forced-funcoes-get-by-id-failure"
}
```

## Compatibilidade observada com consumers reais

- A tela em `views/gestor/funcoes.ejs` consome `payload.data ?? payload.dados ?? payload`
- O retorno observado `success: true, data: {...}` permanece compativel com esse consumer
- A view usa `unidade_principal_id` tanto como objeto com `_id` quanto como valor simples; o owner observado devolve valor simples, o que continua compativel
- `modulos_habilitados` como array de objetos `{ _id, nome }` tambem permanece compativel com a hidratacao da tela de edicao
- Os consumers colaterais de Funcionarios nao dependem desta rota

## Matriz coberta pela suite

- sem sessao no app real
- admin sem contexto efetivo e recurso inexistente
- lookup escopado por contexto canonico
- owner isolado sem contexto canonico
- sucesso com payload normalizado para a tela de edicao
- sucesso com descricao vazia e unidade principal nula
- erro interno induzido

## Decisao de congelamento

- O microcorte seguro `GET /gestor/api/funcoes/:id` ficou congelado com caracterizacao focal verde
- Nenhum passo de `POST`, `PUT`, `DELETE` ou `bulk-update` foi aberto nesta rodada