# Checkpoint: Gestor Funcoes Update UnitScope Param Runtime Contract

Data: 2026-03-25
Escopo: caracterizacao runtime conservadora de PUT /gestor/api/funcoes/:id como microcorte focal da frente de autorizacao por unitScope com alvo por parametro
Suite focal: tests/gestor-funcoes-update-runtime-contract.test.js
Execucao focal: node --experimental-test-module-mocks --test .\tests\gestor-funcoes-update-runtime-contract.test.js
Resultado: 6 testes passando

## Snapshot operacional

- Branch: migration/refactor-core
- HEAD observado na abertura da rodada: f153c8f2ecdc33b22b7fe4a8ac5e910ef4424f5f
- Worktree ja estava sujo com artefatos focais anteriores; nada foi limpo
- Sem patch de producao nesta rodada

## Wiring confirmado

- O corredor de API de Funcoes continua montado via mount app.use('/', funcaoApiRouter)
- A rota canonica desta subfase e PUT /gestor/api/funcoes/:id
- O encadeamento observado na borda permanece requireLogin -> requireUnitScope -> updateFuncao
- A borda real foi usada apenas para sem sessao; os demais cenarios foram congelados no owner real isolado

## Contrato observado

### Sem sessao

- PUT /gestor/api/funcoes/:id no app real responde 401 JSON
- Envelope observado:

```json
{
  "success": false,
  "error": "Não autenticado",
  "code": "UNAUTHORIZED"
}
```

### Id invalido

- O owner nao possui validacao sintatica explicita para req.params.id
- Quando o id e invalido, o fluxo observado chama findFuncaoById(id, null)
- Sem documento encontrado, a resposta observada colapsa para 404

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Função não encontrada"
}
```

### Ausencia de contexto canonico

- Neste owner, ausencia de req.unitScope nao materializa um bloqueio proprio
- O fluxo observado apenas usa principal contextual nula no lookup inicial
- Portanto, nao houve resposta dedicada para contexto ausente neste microcorte

### Alvo fora do escopo contextual

- Quando req.unitScope.unidadeId existe, o owner resolve a principal contextual antes do lookup inicial
- O alvo fora do escopo contextual cai nesse lookup inicial escopado
- O comportamento observado para esse caso foi:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Função não encontrada"
}
```

- O owner observado chama findFuncaoById(id, principalContextual)
- Nao houve materializacao de 400 de acesso nao autorizado para o alvo por id desta rota

### Funcao inexistente no escopo efetivo

- Quando o lookup inicial findFuncaoById(id, principalEfetiva) nao encontra documento, a resposta observada tambem e 404

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Função não encontrada"
}
```

### Sucesso

- Em sucesso, o owner retorna 200 com envelope success true e payload em data
- O shape exato congelado foi:

```json
{
  "success": true,
  "data": {
    "updated": true,
    "funcao": {
      "_id": "507f1f77bcf86cd799439011",
      "codigo": "SUP",
      "nome": "Supervisor Senior",
      "descricao": "Coordena equipe ampliada",
      "descricao_display": "Coordena equipe ampliada",
      "hasDescricaoReal": true
    }
  }
}
```

- No caminho feliz observado:
  - o lookup inicial usa a principal contextual efetiva
  - o owner recarrega a unidade principal efetiva para filtrar modulos permitidos
  - modulos nao permitidos no body sao descartados silenciosamente antes da persistencia
  - a resposta final nao expoe unidade_principal_id nem modulos_habilitados

### Erro interno relevante

- Excecao interna em updateFuncaoById cai no catch externo do owner e responde 500
- Envelope observado:

```json
{
  "success": false,
  "code": "SERVER_ERROR",
  "message": "forced-funcoes-update-failure"
}
```

## Observacoes importantes do runtime

- O alvo por id desta rota nao responde com 400 de acesso negado; fora do escopo contextual ele colapsa em 404 de função não encontrada porque o lookup inicial ja sai escopado pela principal contextual
- Ausencia de contexto canonico nao gera bloqueio proprio neste owner; sem req.unitScope o fluxo usa principal nula no lookup inicial
- O owner usa a principal contextual como unidade efetiva dominante no update quando o contexto existe
- O filtro de modulos habilitados acontece antes da persistencia e descarta ids nao permitidos sem erro explicito
- Este microcorte nao reabre DELETE, bulk-update nem a trilha separada de unidade_principal_id fora do cluster no body

## Decisao final

- PUT /gestor/api/funcoes/:id ficou congelado como microcorte seguro da frente de autorizacao por unitScope com alvo por parametro
- O contrato desta rota ficou fechado sem reabrir DELETE, bulk-update ou qualquer outro corredor de Funcoes
