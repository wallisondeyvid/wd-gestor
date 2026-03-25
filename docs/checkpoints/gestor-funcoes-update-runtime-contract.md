# Checkpoint: Gestor Funcoes Update Runtime Contract

Data: 2026-03-24
Escopo: caracterizacao runtime conservadora de PUT /gestor/api/funcoes/:id
Suite focal: tests/gestor-funcoes-update-runtime-contract.test.js
Execucao focal: node --test .\tests\gestor-funcoes-update-runtime-contract.test.js
Resultado: 8 testes passando

## Status documental local

- Este arquivo ficou superado localmente pelo microcorte focal documentado em docs/checkpoints/gestor-funcoes-update-unitScope-param-runtime-contract.md.
- A referencia corrente reconciliada para PUT /gestor/api/funcoes/:id e o checkpoint novo, porque a suite local atual em tests/gestor-funcoes-update-runtime-contract.test.js materializa a matriz estreita de 6 testes do microcorte de unitScope, nao a matriz ampla de 8 testes descrita neste arquivo.
- Este checkpoint antigo deve ser lido apenas como registro historico de uma caracterizacao mais ampla anterior, nao como contrato corrente reconciliado do estado local.

## Snapshot operacional

- Branch: migration/refactor-core
- HEAD observado na abertura da rodada: f153c8f2ecdc33b22b7fe4a8ac5e910ef4424f5f
- Worktree ja estava sujo apenas com artefatos locais novos de Funcoes; nada foi limpo
- Sem patch de producao nesta rodada

## Wiring confirmado

- O corredor de API de Funcoes continua montado via mount `app.use('/', funcaoApiRouter)`
- A rota canonica desta subfase e `PUT /gestor/api/funcoes/:id`
- O consumer real mais direto desta rota e o submit da tela `views/gestor/funcoes.ejs` quando `hiddenId` esta preenchido

## Contrato observado

### Sem sessao

- `PUT /gestor/api/funcoes/:id` no app real responde `401` JSON
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

### Duplicidade por nome

- A checagem de duplicidade so ocorre quando `nome` vem preenchido e diferente do nome atual da funcao
- A consulta observada usa a principal efetiva do update
- Em duplicidade, o owner responde `400` com mensagem `Já existe uma função com este nome`

### Unidade alvo e contexto

- Se `unidade_principal_id` vier no body, o owner valida explicitamente se essa unidade pertence ao cluster contextual acessivel
- Fora do cluster contextual, responde `404`
- Envelope observado:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Unidade principal não encontrada"
}
```

- O runtime observado resolve a unidade contextual mais de uma vez no caminho com contexto: uma para derivar a principal canonica e outra durante a checagem de pertencimento da unidade solicitada ao cluster

### Unidade efetiva e modulos habilitados

- A unidade efetiva usada para carregar modulos acessiveis e a principal efetiva do update: a contextual, se houver, ou a unidade do body, ou a unidade atual da funcao
- Se essa unidade efetiva nao existir, o owner responde `400` com mensagem `Unidade inválida`
- `modulos_habilitados` aceita lista, string CSV ou JSON serializado, mas o owner filtra o payload final para manter apenas ids presentes em `unidade.modulosAcessiveis`
- No runtime observado, mesmo quando o update muda apenas modulos, o owner ainda envia `unidade_principal_id` da principal efetiva dentro do objeto `updates`

### Sucesso

- Em sucesso, o owner responde `200` com envelope `success: true`
- O payload observado vem em `data` com:
  - `updated: true`
  - `funcao` normalizada com `_id`, `codigo`, `nome`, `descricao`, `descricao_display`, `hasDescricaoReal`
- O retorno observado foi:

```json
{
  "success": true,
  "data": {
    "updated": true,
    "funcao": {
      "_id": "507f1f77bcf86cd799439011",
      "codigo": "SUP",
      "nome": "Supervisor Atualizado",
      "descricao": "Coordena equipe",
      "descricao_display": "Coordena equipe",
      "hasDescricaoReal": true
    }
  }
}
```

- Regras de fallback observadas no owner:
  - `descricao` cai para string vazia quando ausente
  - `descricao_display` usa a descricao real quando existe
  - sem descricao real, `descricao_display` usa `nome` quando `nome !== codigo`
  - sem descricao real e com `nome === codigo`, `descricao_display` vira string vazia neste owner

### Erro interno

- Excecao interna em `updateFuncao` cai no catch e responde `500`
- Envelope observado:

```json
{
  "success": false,
  "code": "SERVER_ERROR",
  "message": "forced-funcoes-update-failure"
}
```

## Compatibilidade observada com consumers reais

- A tela em `views/gestor/funcoes.ejs` envia JSON com `nome`, `descricao`, `unidade_principal_id` e `modulos_habilitados`
- Em update, a view so exige `2xx` e ausencia de envelope negativo; depois recarrega a pagina
- O retorno observado `success: true, data: { updated, funcao }` permanece compativel com esse consumer, que nao exige shape especifico no caminho verde
- Os consumers de Funcionarios nao dependem desta rota

## Matriz coberta pela suite

- sem sessao no app real
- recurso inexistente sem contexto canonico
- recurso inexistente no contexto canonico
- duplicidade quando o nome muda
- unidade alvo fora do cluster contextual
- sucesso com filtragem de modulos e payload normalizado
- update apenas de modulos sem troca explicita de unidade
- erro interno induzido

## Decisao de congelamento

- O microcorte seguro `PUT /gestor/api/funcoes/:id` ficou congelado com caracterizacao focal verde
- Nenhum passo de `DELETE /gestor/api/funcoes/:id` ou `POST /gestor/api/funcoes/bulk-update` foi aberto nesta rodada