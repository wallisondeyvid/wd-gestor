# Checkpoint: Gestor Setores Get By Id Runtime Contract

Data: 2026-03-25
Branch: migration/refactor-core
HEAD: f153c8f2ecdc33b22b7fe4a8ac5e910ef4424f5f

## Escopo congelado

- GET /gestor/api/setores/:id

Sem reabrir:

- POST /gestor/api/setores
- GET /gestor/api/setores/unidade/:unidadeId
- GET /gestor/api/setores
- PUT /gestor/api/setores/:id
- DELETE /gestor/api/setores/:id
- endpoints de debug
- frontend
- produção

## Arquivo focal

- Suite: tests/gestor-setores-get-by-id-runtime-contract.test.js

Comando validado:

```powershell
node --test .\tests\gestor-setores-get-by-id-runtime-contract.test.js
```

Resultado observado: 2 testes passando, 0 falhando.

## Snapshot e wiring confirmado

- No sub-app real, o mount do corredor permanece via setorApiRouter em src/modules/gestor/app/gestor-app.js.
- A rota focal permanece registrada como GET /api/setores/:id com requireLogin + requireUnitScope em src/modules/gestor/app/routes/setorApi.js.
- O owner focal permanece em getSetor, dentro de src/modules/gestor/app/controllers/setorApiController.js.

## Contrato validado

### 1. Alvo escopado inexistente no contexto

Quando o owner consulta o setor usando o id solicitado e a unidade canônica do contexto e nao encontra alvo, responde 404:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Setor não encontrado"
}
```

Lookup observado no contrato validado:

- findSetorByIdPopulateUnidade(req.params.id, canonicalUnitId)

### 2. Caminho feliz minimo de leitura

Quando o alvo existe dentro do contexto canônico, o owner:

- consulta o setor com id + unidade contextual
- retorna um payload plano
- expõe unidade_id apenas como o _id da unidade populada
- normaliza descricao ausente para string vazia

Envelope observado:

```json
{
  "success": true,
  "data": {
    "_id": "s-ok",
    "nome": "Financeiro",
    "descricao": "",
    "unidade_id": "u-contexto"
  }
}
```

## Regras explicitas observadas no owner

- Nesta rodada nao apareceu regra adicional de bloqueio alem do proprio lookup escopado pelo contexto canônico.
- Fora do contexto, o comportamento validado colapsa em Setor não encontrado.
- O enriquecimento essencial realmente observável no owner foi o mapeamento do populate de unidade para unidade_id simples no payload e a normalizacao de descricao para string vazia.

## Limites desta caracterizacao

- Esta rodada nao validou o gate 401 sem sessao no app real.
- Esta rodada nao validou erro interno generico.
- Esta rodada nao validou o ramo em que unidade_id populada esteja ausente, produzindo null.
- O checkpoint congela apenas o contrato efetivamente coberto pela suite focal nova.

## Decisao final

- Classificacao: microcorte focal aberto e caracterizado com sucesso.
- Motivo: GET /gestor/api/setores/:id agora tem suite e checkpoint proprios cobrindo lookup escopado, uso do unitScope canônico e envelope de sucesso de leitura, sem qualquer patch de producao.