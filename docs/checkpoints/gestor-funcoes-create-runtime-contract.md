# Checkpoint: Gestor Funcoes Create Runtime Contract

Data: 2026-03-24
Escopo: caracterizacao runtime conservadora de POST /gestor/api/funcoes
Suite focal: tests/gestor-funcoes-create-runtime-contract.test.js
Execucao focal: node --test .\tests\gestor-funcoes-create-runtime-contract.test.js
Resultado: 8 testes passando

## Snapshot operacional

- Branch: migration/refactor-core
- HEAD observado na abertura da rodada: f153c8f2ecdc33b22b7fe4a8ac5e910ef4424f5f
- Worktree ja estava sujo apenas com artefatos locais novos de Funcoes; nada foi limpo
- Sem patch de producao nesta rodada

## Wiring confirmado

- O corredor de API de Funcoes continua montado via mount `app.use('/', funcaoApiRouter)`
- A rota canonica desta subfase e `POST /gestor/api/funcoes`
- O consumer real mais direto desta rota e o submit da tela `views/gestor/funcoes.ejs`

## Contrato observado

### Sem sessao

- `POST /gestor/api/funcoes` no app real responde `401` JSON
- Envelope observado:

```json
{
  "success": false,
  "error": "Não autenticado",
  "code": "UNAUTHORIZED"
}
```

### Validacoes obrigatorias

- Sem `nome`, o owner responde `400` e interrompe antes de lookup de duplicidade ou criacao
- Sem contexto canonico e sem `unidade_principal_id`, o owner responde `400`
- As mensagens observadas sao:
  - `Nome é obrigatório`
  - `Unidade principal é obrigatória`

### Contexto canonico e unidade alvo

- Quando `req.unitScope.unidadeId` existe, o owner resolve a principal contextual e passa a usa-la como principal canonica da criacao
- Mesmo com principal canonica contextual definida, o owner ainda valida se a `unidade_principal_id` solicitada pertence ao cluster contextual acessivel
- Se a unidade solicitada estiver fora do cluster contextual, o owner responde `404`
- Envelope observado:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Unidade principal não encontrada"
}
```

- O runtime observado resolve a unidade contextual mais de uma vez no caminho de validacao: uma para derivar a principal canonica e outra durante a checagem de pertencimento do alvo ao cluster

### Duplicidade por nome

- Depois da validacao de contexto, o owner consulta duplicidade por `nome` na principal canonica efetiva
- Em contexto escopado por filial, a consulta observada usa a principal contextual, nao a unidade enviada no body
- Em duplicidade, o owner responde `400` com mensagem `Função já cadastrada`

### Unidade invalida e modulos habilitados

- A unidade efetiva usada para carregar modulos acessiveis e sempre a principal canonica da criacao
- Se a unidade efetiva nao for encontrada, o owner responde `400` com mensagem `Unidade inválida`
- `modulos_habilitados` aceita lista, string CSV ou JSON serializado, mas o owner filtra o payload final para manter apenas ids presentes em `unidade.modulosAcessiveis`
- No caso verde observado, ids nao permitidos sao descartados silenciosamente antes da persistencia

### Sucesso

- Em sucesso, o owner responde `201`
- A criacao observada persiste com:
  - `nome`
  - `descricao`
  - `unidade_principal_id` igual a principal canonica efetiva
  - `modulos_habilitados` ja filtrados pelos permitidos da unidade efetiva
- O retorno observado expõe o `_id` criado em `data._id`

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011"
  }
}
```

### Erro interno

- Excecao interna em `createFuncao` cai no catch e responde `500`
- Envelope observado:

```json
{
  "success": false,
  "code": "SERVER_ERROR",
  "message": "forced-funcoes-create-failure"
}
```

## Compatibilidade observada com consumers reais

- A tela em `views/gestor/funcoes.ejs` envia JSON com `nome`, `descricao`, `unidade_principal_id` e `modulos_habilitados`
- Em criacao, a view so exige `2xx` e ausencia de envelope negativo; depois recarrega a pagina
- O retorno minimo observado `success: true, data: { _id }` permanece compativel com esse consumer
- Os consumers de Funcionarios nao dependem desta rota

## Matriz coberta pela suite

- sem sessao no app real
- `nome` ausente
- unidade principal ausente sem contexto canonico
- unidade alvo fora do cluster contextual
- duplicidade por nome na principal canonica
- filtragem de modulos permitidos com criacao verde
- unidade canonica invalida
- erro interno induzido

## Decisao de congelamento

- O microcorte seguro `POST /gestor/api/funcoes` ficou congelado com caracterizacao focal verde
- Nenhum passo de `PUT /gestor/api/funcoes/:id`, `DELETE /gestor/api/funcoes/:id` ou `POST /gestor/api/funcoes/bulk-update` foi aberto nesta rodada