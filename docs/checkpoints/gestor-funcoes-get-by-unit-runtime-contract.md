# Checkpoint: Gestor Funcoes Get By Unit Runtime Contract

Data: 2026-03-24
Escopo: caracterizacao runtime conservadora de GET /gestor/api/funcoes/unidade/:unidadeId
Suite focal: tests/gestor-funcoes-get-by-unit-runtime-contract.test.js
Execucao focal: node --test .\tests\gestor-funcoes-get-by-unit-runtime-contract.test.js
Resultado: 6 testes passando

## Snapshot operacional

- Branch: migration/refactor-core
- HEAD observado na abertura da rodada: 3e7a85845a92b6c3df6537ca39dfcbd5f7782729
- Worktree observado limpo no snapshot da rodada
- Sem patch de producao nesta rodada

## Wiring confirmado

- O corredor de API de Funcoes continua montado via mount `app.use('/', funcaoApiRouter)`
- A rota canonica desta subfase e `GET /gestor/api/funcoes/unidade/:unidadeId`
- A pagina correlata mais sensivel a este contrato e `GET /gestor/funcionarios`, via modal de selecao de funcao e fallback de selects

## Contrato observado

### Sem sessao

- `GET /gestor/api/funcoes/unidade/:unidadeId` no app real responde `401` JSON
- Envelope observado:

```json
{
  "success": false,
  "error": "Não autenticado",
  "code": "UNAUTHORIZED"
}
```

### Unidade nula

- Quando `req.params.unidadeId` e vazio logico ou string `null`, o owner responde `200` com lista vazia
- Nessa condicao, o owner nao consulta lookup de unidade nem listagem de funcoes
- Envelope observado:

```json
{
  "success": true,
  "data": []
}
```

### Unidade fora do cluster contextual

- Para usuario contextual, o owner deriva a principal canonica do `req.unitScope.unidadeId`
- Se a unidade alvo resolver para principal diferente da principal contextual, o owner responde `200` com lista vazia
- Nessa condicao, a listagem de funcoes nao e chamada
- Envelope observado:

```json
{
  "success": true,
  "data": []
}
```

### Resolucao principal da unidade alvo

- Para filial dentro do mesmo cluster contextual, o owner resolve `unidadeId` para sua unidade principal antes de consultar a listagem
- O fetch observado chama `findFuncoesByPrincipalUnitIdLean(principalUnitId)`

### Sucesso

- Em sucesso, o owner retorna `200` com envelope `success: true` e array em `data`
- Cada item observado expõe:
  - `_id`
  - `nome`
  - `codigo`
  - `descricao`
  - `descricao_display`
  - `descricao_final`
  - `hasDescricaoReal`
- Regras de fallback observadas:
  - `descricao` vira string vazia quando nao ha descricao real
  - `descricao_display` usa a descricao real quando existe
  - sem descricao real, `descricao_display` usa `nome` quando `nome !== codigo`
  - sem descricao real e com `nome === codigo`, `descricao_display` usa `codigo`
  - `descricao_final` usa `descricao || nome || codigo`

```json
{
  "success": true,
  "data": [
    {
      "_id": "f-1",
      "nome": "Analista RH",
      "codigo": "C001",
      "descricao": "Responsável por RH",
      "descricao_display": "Responsável por RH",
      "descricao_final": "Responsável por RH",
      "hasDescricaoReal": true
    },
    {
      "_id": "f-2",
      "nome": "C002",
      "codigo": "C002",
      "descricao": "",
      "descricao_display": "C002",
      "descricao_final": "C002",
      "hasDescricaoReal": false
    }
  ]
}
```

### Sem contexto canonico no owner isolado

- No owner isolado, sem `req.unitScope`, o fluxo nao bloqueia por contexto ausente
- Se o lookup de unidade nao encontrar a unidade alvo, a propria `unidadeId` e usada como chave de listagem
- O envelope de sucesso continua o mesmo `success: true, data: [] | itens`

### Erro interno

- Excecao interna em `getFuncoesPorUnidade` cai no catch e responde `500`
- Envelope observado:

```json
{
  "success": false,
  "code": "SERVER_ERROR",
  "message": "forced-funcoes-get-by-unit-failure"
}
```

## Compatibilidade observada com consumers reais

- O modal em `public/gestor/js/modals/selecionar_funcao.js` aceita tanto array puro quanto envelope com `data`
- Na rota focal, o envelope observado `success: true, data: [...]` permanece compativel com esse consumer
- O consumer condicional em `public/gestor/js/pages/funcionarios_selects.js` espera array puro; como ele so preenche o select quando `response.json()` ja vier array, esse caminho nao foi aberto aqui e continua sendo um ponto de atencao para a trilha posterior
- O modal privilegia `nome`, depois `descricao`, depois `codigo`, coerente com o shape observado

## Matriz coberta pela suite

- sem sessao no app real
- `unidadeId = null`
- unidade alvo fora do cluster contextual
- filial contextual resolvida para unidade principal
- owner isolado sem contexto canonico e fallback para a propria unidade
- erro interno induzido

## Decisao de congelamento

- O microcorte seguro `GET /gestor/api/funcoes/unidade/:unidadeId` ficou congelado com caracterizacao focal verde
- Nenhum passo de `GET /gestor/api/funcoes`, `GET /gestor/api/funcoes/:id`, `POST`, `PUT`, `DELETE` ou `bulk-update` foi aberto nesta rodada