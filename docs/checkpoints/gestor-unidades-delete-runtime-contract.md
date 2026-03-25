# Checkpoint: Gestor Unidades Delete Runtime Contract

Data: 2026-03-24
Branch: migration/refactor-core
HEAD: 4d8af986b9723991ef99f28a15e7b1fbe932bb06

## Escopo congelado

- DELETE /gestor/api/unidades/:id

Sem reabrir:

- GET /gestor/api/unidades
- GET /gestor/api/unidades/:id
- POST
- PUT
- logo/logo-inline
- endpoint publico
- toggle-access
- provisioning status/events/retry
- testar-banco
- frontend

## Arquivo focal

- Suite: tests/gestor-unidades-delete-runtime-contract.test.js

Comando validado:

```powershell
node --test .\tests\gestor-unidades-delete-runtime-contract.test.js
```

Resultado observado: 8 testes passando, 0 falhando.

## Snapshot e wiring confirmado

- No sub-app real, o mount das APIs de unidades permanece via unidadeApiRouter em src/modules/gestor/app/gestor-app.js.
- A rota focal permanece registrada como DELETE /api/unidades/:id com withLoginAndRequiredUnitScope em src/modules/gestor/app/routes/unidadeApi.js.
- Os consumers de página relacionados ao corredor permanecem em src/modules/gestor/app/routes/pagesRouter.js via GET /unidades e GET /editar-unidades/:id.

## Contrato congelado

### 1. Sem sessao no app real

No app real, DELETE /gestor/api/unidades/:id responde 401 em JSON sem sessao:

```json
{
  "success": false,
  "error": "Não autenticado",
  "code": "UNAUTHORIZED"
}
```

### 2. Id vazio ou invalido, conforme o runtime real

O owner atual nao possui validacao sintatica explicita de id antes do lookup.

Quando req.params.id esta vazio, o runtime observado ainda chama findUnidadeById('') e, sem alvo resolvido, responde 404:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Unidade não encontrada"
}
```

### 3. Unidade inexistente

Quando findUnidadeById(unidadeId) nao encontra a unidade, o owner responde 404 com o mesmo envelope:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Unidade não encontrada"
}
```

### 4. Fora do escopo contextual

O owner primeiro faz o lookup da unidade alvo e so depois valida acesso via ensureCanAccessUnidade(req, unidade._id).

Se o alvo nao pertencer ao cluster acessivel do unitScope, a resposta observada e 400:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "Acesso à unidade não autorizado."
}
```

### 5. Sucesso com unidade encontrada

Quando a unidade existe, o acesso contextual passa e ela nao cai em regra restritiva de principal, o owner executa deleteUnidadeById(unidadeId) e responde 200 com envelope minimo:

```json
{
  "success": true,
  "data": {
    "deleted": true,
    "id": "u-ok"
  }
}
```

### 6. Regra especifica para unidade principal

O owner tem regra especifica de exclusao para unidade principal, aplicada depois do gate contextual:

- se req.user.role === diretor, responde 400 com:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "Diretores não podem excluir unidades principais."
}
```

- se a unidade for principal e req.user.isMaster nao for true, responde 400 com:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "Apenas Master pode excluir unidades principais"
}
```

Na ordem real observada, um diretor so atinge a regra especifica se o acesso contextual a essa unidade principal ja estiver satisfeito.

### 7. Envelope exato de sucesso

O owner nao retorna documento excluido, contagens ou metadados adicionais.

O envelope observado de sucesso e exatamente:

```json
{
  "success": true,
  "data": {
    "deleted": true,
    "id": "<unidadeId>"
  }
}
```

### 8. Envelope de erro

Os envelopes observados neste owner sao:

- 404 not found com code NOT_FOUND e message Unidade não encontrada
- 400 bad request contextual com code BAD_REQUEST e message Acesso à unidade não autorizado.
- 400 bad request para regra de principal com mensagens especificas acima
- 500 server error com code SERVER_ERROR e mensagem original do erro capturado

### 9. Erro interno induzido

Quando findUnidadeById lanca erro, o owner cai no catch externo e responde 500 com a mensagem original:

```json
{
  "success": false,
  "code": "SERVER_ERROR",
  "message": "forced-delete-failure"
}
```

## Observacoes importantes do runtime

- O gate sem sessao deste corredor e JSON 401, nao redirect.
- O owner faz o lookup da unidade antes da validacao contextual, assim como no GET por id.
- O owner nao valida id vazio explicitamente; o comportamento para id vazio decorre do lookup falhar.
- A regra de unidade principal nao substitui o gate contextual: para diretor, primeiro precisa haver acesso contextual ao alvo para que a mensagem especifica de principal apareca.
- O envelope de sucesso e deliberadamente enxuto: apenas deleted true e id.
- O catch externo usa serverError e preserva a mensagem original do erro induzido.

## Decisao final

- Classificacao: proxima subfase aberta com guardrail focal fechado.
- Motivo: o runtime atual de DELETE /gestor/api/unidades/:id foi caracterizado por suite isolada, cobrindo gate real, lookup, validacao contextual, regras de exclusao, envelope de sucesso e erro interno sem patch de producao.

## Confirmacao explicita

- Producao nao foi alterada.
- Frontend nao foi alterado.
- Testes antigos nao foram alterados.
- Checkpoints existentes nao foram alterados.
- Nao foram abertos PUT nem POST.
- Nao foram reabertos logo/logo-inline.
- Nao foi reaberto endpoint publico.
- Nao foram reabertos toggle-access nem provisioning/status/events/retry.
- Nao foram reabertos GET /gestor/api/unidades nem GET /gestor/api/unidades/:id.
- Apenas a suite focal nova e este checkpoint novo foram criados nesta rodada.