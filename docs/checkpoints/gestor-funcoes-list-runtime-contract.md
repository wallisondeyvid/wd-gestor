# Checkpoint: Gestor Funcoes List Runtime Contract

Data: 2026-03-24
Escopo: caracterizacao runtime conservadora de GET /gestor/api/funcoes
Suite focal: tests/gestor-funcoes-list-runtime-contract.test.js
Execucao focal: node --test .\tests\gestor-funcoes-list-runtime-contract.test.js
Resultado: 7 testes passando

## Snapshot operacional

- Branch: migration/refactor-core
- HEAD observado na abertura da rodada: 3e7a85845a92b6c3df6537ca39dfcbd5f7782729
- Worktree ja estava sujo apenas com os artefatos novos da trilha local de Funcoes; nada foi limpo
- Sem patch de producao nesta rodada

## Wiring confirmado

- O corredor de API de Funcoes continua montado via mount `app.use('/', funcaoApiRouter)`
- A rota canonica desta subfase e `GET /gestor/api/funcoes`
- O consumer real mais sensivel deste microcorte e o fallback do modal de selecao em Funcionarios, via query `?unidade_id=<id>&q=<termo>`

## Contrato observado

### Sem sessao

- `GET /gestor/api/funcoes` no app real responde `401` JSON
- Envelope observado:

```json
{
  "success": false,
  "error": "Não autenticado",
  "code": "UNAUTHORIZED"
}
```

### Sem filtros

- Quando nenhum filtro entre `unidade_cluster` e `unidade_id` e informado, o owner responde `200` com lista vazia
- Nessa condicao, nao consulta `findFuncoesByFiltroLean` nem `findFuncoesByFiltroSelectLean`
- Envelope observado:

```json
{
  "success": true,
  "data": []
}
```

### Ramo `unidade_cluster`

- O owner valida se `unidade_cluster` pertence ao cluster contextual acessivel
- Fora do cluster contextual, responde `200` com lista vazia e nao consulta funcoes
- Dentro do cluster, resolve a unidade para sua principal e consulta:

```json
{ "unidade_principal_id": "<principalResolvida>" }
```

- Se `q` vier preenchido, o filtro textual ocorre em memoria sobre `nome`, `codigo` e `descricao`, com comparacao case-insensitive
- O retorno final e ordenado por `nome`
- O shape observado neste ramo e minimalista:

```json
{
  "success": true,
  "data": [
    {
      "_id": "f-1",
      "nome": "Analista",
      "descricao": "Atua na análise",
      "codigo": "ANA"
    },
    {
      "_id": "f-3",
      "nome": "Analista Senior",
      "descricao": "",
      "codigo": "ASR"
    }
  ]
}
```

### Ramo `unidade_id`

- O owner aceita `unidade_id` simples ou lista separada por virgula
- Cada candidato e validado contra o cluster contextual; candidatos fora do escopo sao descartados silenciosamente
- Cada candidato valido e resolvido para sua unidade principal
- As principais resolvidas sao deduplicadas antes da consulta
- Se nenhuma principal valida restar, responde `200` com lista vazia
- Com uma principal unica, o filtro observado foi:

```json
{ "unidade_principal_id": "<principalResolvida>" }
```

- O shape observado neste ramo e expandido para servir o fallback do modal:

```json
{
  "success": true,
  "data": [
    {
      "_id": "f-10",
      "codigo": "SUP",
      "nome": "Supervisor",
      "descricao": "",
      "descricao_display": "Supervisor",
      "descricao_final": "Supervisor",
      "hasDescricaoReal": false
    },
    {
      "_id": "f-11",
      "codigo": "C002",
      "nome": "C002",
      "descricao": "",
      "descricao_display": "C002",
      "descricao_final": "C002",
      "hasDescricaoReal": false
    }
  ]
}
```

- Regras de fallback observadas neste ramo:
  - `descricao` vira string vazia quando nao ha descricao real
  - `descricao_display` usa `descricao` real quando existe
  - sem descricao real, usa `nome` quando `nome !== codigo`
  - sem descricao real e com `nome === codigo`, usa `codigo`
  - `descricao_final` usa `descricao || nome || codigo`

### Erro interno

- Excecao interna em `listarFuncoesApi` cai no catch e responde `500`
- Envelope observado:

```json
{
  "success": false,
  "code": "SERVER_ERROR",
  "message": "forced-funcoes-list-failure"
}
```

## Compatibilidade observada com consumers reais

- O modal em `public/gestor/js/modals/selecionar_funcao.js` usa como fallback `GET /api/funcoes?unidade_id=<id>&q=<termo>` e aceita tanto array puro quanto envelope com `data`
- O shape expandido observado no ramo `unidade_id` permanece compativel com esse modal, que privilegia `nome`, depois `descricao`, depois `codigo`
- O consumer condicional em `public/gestor/js/pages/funcionarios_selects.js` continua esperando array puro quando chama a rota especifica por unidade, nao este endpoint
- A pagina propria de Funcoes em `views/gestor/funcoes.ejs` nao depende deste endpoint para renderizar a lista principal

## Matriz coberta pela suite

- sem sessao no app real
- `unidade_cluster` fora do contexto
- `unidade_cluster` valido com busca por `q` e ordenacao por nome
- `unidade_id` fora do contexto
- `unidade_id` multiplo com resolucao para principal e deduplicacao
- ausencia total de filtros
- erro interno induzido

## Decisao de congelamento

- O microcorte seguro `GET /gestor/api/funcoes` ficou congelado com caracterizacao focal verde
- Nenhum passo de `GET /gestor/api/funcoes/:id`, `POST`, `PUT`, `DELETE` ou `bulk-update` foi aberto nesta rodada