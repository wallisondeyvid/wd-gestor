# Checkpoint: Gestor Recursos List Runtime Contract

Data: 2026-03-24
Escopo: caracterizacao runtime conservadora de GET /gestor/api/recursos
Suite focal: tests/gestor-recursos-list-runtime-contract.test.js
Execucao focal: node --test .\tests\gestor-recursos-list-runtime-contract.test.js
Resultado: 7 testes passando

## Snapshot operacional

- Branch: migration/refactor-core
- HEAD observado na abertura da rodada: 4d8af986b9723991ef99f28a15e7b1fbe932bb06
- Worktree sujo apenas com artefatos nao rastreados de microcortes anteriores de Unidades; nada foi limpo
- Sem patch de producao nesta rodada

## Wiring confirmado

- O corredor de API de Recursos esta montado via [gestor-app.js] no mount `app.use('/', recursoApiRouter)`
- A rota canônica de leitura desta rodada e `GET /gestor/api/recursos`
- A pagina correlata continua em `GET /gestor/recursos`

## Contrato observado

### Sem sessao

- `GET /gestor/api/recursos` no app real responde `401` JSON
- Envelope observado:

```json
{
  "success": false,
  "error": "Não autenticado",
  "code": "UNAUTHORIZED"
}
```

### Bloqueio por contexto ausente

- Usuario nao privilegiado sem contexto canonico de unidade recebe `404`
- Envelope observado:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Unidade não encontrada"
}
```

### Leitura privilegiada

- Usuario `admin` sem `unidadeId` consulta `findRecursosByFiltroComUnidadeLean({})`
- O retorno HTTP observado usa envelope com `success: true` e `data: []`
- O shape de cada item e híbrido para servir tanto a pagina Gestor quanto os consumers de Escalas:

```json
{
  "id": "r-1",
  "_id": "r-1",
  "placa": "ABC-1234",
  "tipo": "carro",
  "marca": "Fiat",
  "modelo": "Argo",
  "ano": 2024,
  "mod": 2025,
  "cor": "Branco",
  "ativo": true,
  "unidade_id": {
    "_id": "u-1",
    "codigo": "M001",
    "nome": "Matriz Centro"
  },
  "descricao": "Fiat Argo",
  "unidadeFormatada": "M001 - Matriz Centro"
}
```

### Filtro por placa

- O owner normaliza placa removendo caracteres nao alfanumericos e usando uppercase
- O filtro parcial por placa e aplicado apenas quando o termo possui ao menos 2 caracteres
- No caso caracterizado, a busca `aBc1d` retornou `ABC-1D34`

### Escopo contextual para usuario nao privilegiado

- O owner deriva a unidade canonica de `req.unitScope.unidadeId` ou fallback legado de sessao
- Quando o anchor e principal, o cluster acessivel e montado com:

```json
{
  "$or": [
    { "_id": "u-principal" },
    { "unidade_principal_id": "u-principal" },
    { "matriz_id": "u-principal" }
  ]
}
```

- Se `unidadeId` for informada fora desse cluster, o owner retorna `200` com lista vazia e nao consulta recursos
- Se `unidadeId` estiver dentro do cluster, o owner restringe o filtro final para essa unidade

### Erro interno

- Excecao interna em `listarRecursosApi` cai no catch e responde `500`
- Envelope observado:

```json
{
  "success": false,
  "code": "SERVER_ERROR",
  "message": "forced-recursos-list-failure"
}
```

## Compatibilidade observada com consumers reais

- A pagina Gestor em `public/gestor/js/pages/recursos.js` aceita `payload.data` como array para renderizar a tabela
- O consumer colateral de Escalas em `localizar_recurso.js` tambem aceita `data` como array
- O modal de Escalas em `modal_recurso.js` usa o mesmo endpoint de listagem por placa como fallback e depende de campos como `placa`, `marca`, `modelo`, `descricao` e `unidadeFormatada`

## Matriz coberta pela suite

- sem sessao no app real
- usuario nao privilegiado sem contexto canonico
- leitura admin sem filtros
- filtro parcial de placa
- `unidadeId` fora do cluster acessivel
- `unidadeId` dentro do cluster acessivel
- erro interno induzido

## Decisao de congelamento

- O microcorte seguro `GET /gestor/api/recursos` ficou congelado com caracterizacao focal verde
- Nenhum passo de create/update/delete foi aberto nesta rodada