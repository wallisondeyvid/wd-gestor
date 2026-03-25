# Checkpoint: Gestor Setores Update Runtime Contract

Data: 2026-03-25
Branch: migration/refactor-core
HEAD: f153c8f2ecdc33b22b7fe4a8ac5e910ef4424f5f

## Escopo congelado

- PUT /gestor/api/setores/:id

Sem reabrir:

- POST /gestor/api/setores
- GET /gestor/api/setores/unidade/:unidadeId
- GET /gestor/api/setores/:id
- GET /gestor/api/setores
- DELETE /gestor/api/setores/:id
- endpoints de debug
- frontend
- produção

## Arquivo focal

- Suite: tests/gestor-setores-update-runtime-contract.test.js

Comando validado:

```powershell
node --test .\tests\gestor-setores-update-runtime-contract.test.js
```

Resultado observado: 4 testes passando, 0 falhando.

## Snapshot e wiring confirmado

- No sub-app real, o mount do corredor permanece via setorApiRouter em src/modules/gestor/app/gestor-app.js.
- A rota focal permanece registrada como PUT /api/setores/:id com requireLogin + requireUnitScope em src/modules/gestor/app/routes/setorApi.js.
- O owner focal permanece em updateSetor, dentro de src/modules/gestor/app/controllers/setorApiController.js.

## Contrato validado

### 1. Divergencia entre unidade_id do body e contexto canonico

Quando o body envia unidade_id diferente de req.unitScope.unidadeId, o owner interrompe antes do lookup do setor e responde 404:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Unidade não encontrada"
}
```

### 2. Alvo escopado inexistente no contexto

Quando o lookup principal usa o id do setor junto do contexto canonico e nao encontra o alvo, o owner responde 404:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Setor não encontrado"
}
```

Lookup observado no contrato validado:

- findSetorById(req.params.id, canonicalUnitId)

### 3. Duplicidade de nome na mesma unidade

Quando o setor existe no contexto, o owner normaliza o nome informado e consulta duplicidade na mesma unidade. Se encontrar outro setor com o mesmo nome normalizado, responde 400:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "Já existe outro setor com este nome nesta unidade."
}
```

Normalizacao observada nesta caracterizacao:

- entrada: "   Financeiro  Central   "
- nome_normalizado consultado: "financeiro central"

### 4. Caminho feliz minimo

No caminho feliz validado, o owner:

- preserva o setor dentro da unidade contextual
- atualiza nome
- recalcula nome_normalizado
- atualiza descricao
- persiste via saveSetor
- responde 200 com envelope minimo de sucesso

Envelope observado:

```json
{
  "success": true,
  "data": {
    "updated": true
  }
}
```

Mutacao observada antes do save:

```json
{
  "_id": "s-ok",
  "unidade_id": "u-contexto",
  "nome": " Setor Novo ",
  "nome_normalizado": "setor novo",
  "descricao": "Descricao nova"
}
```

## Limites desta caracterizacao

- Esta rodada nao validou o gate 401 sem sessao no app real.
- Esta rodada nao validou erro interno generico.
- Esta rodada nao validou o ramo de Unidade inválida.
- Esta rodada nao validou o tratamento alternativo de erro 11000.
- O checkpoint congela apenas o contrato efetivamente coberto pela suite focal nova.

## Decisao final

- Classificacao: microcorte focal aberto e caracterizado com sucesso.
- Motivo: PUT /gestor/api/setores/:id agora tem suite e checkpoint proprios cobrindo divergencia contextual, alvo escopado inexistente, duplicidade e caminho feliz sem qualquer patch de producao.