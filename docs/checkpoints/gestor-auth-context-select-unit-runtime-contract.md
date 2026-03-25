# Checkpoint: Gestor Auth Context Select Unit Runtime Contract

Data: 2026-03-24
Escopo: caracterizacao runtime conservadora de POST /gestor/auth/select-unit
Suite focal: tests/gestor-auth-context-select-unit-runtime-contract.test.js
Execucao focal: node --test .\tests\gestor-auth-context-select-unit-runtime-contract.test.js
Resultado: 7 testes passando

## Snapshot operacional

- Branch: migration/refactor-core
- HEAD observado na abertura da rodada: f153c8f2ecdc33b22b7fe4a8ac5e910ef4424f5f
- Worktree ja estava sujo apenas com artefatos locais novos de Funcoes e do microcorte anterior de GET auth context; nada foi limpo
- Sem patch de producao nesta rodada

## Wiring confirmado

- O corredor live de auth context continua exposto por authRouter montado via `app.use('/', authRouter)`
- A rota canonica desta subfase e `POST /gestor/auth/select-unit`
- O owner focal e `selectAuthUnit`, que delega para `mutateAuthUnitContext` com `requirePendingSelection: true`
- Nenhum endpoint fora de `POST /gestor/auth/select-unit` foi aberto nesta rodada

## Contrato observado

### Sem sessao no app real

- `POST /gestor/auth/select-unit` no app real responde `401` JSON
- O payload observado com o resolvedor desligado por feature flag no harness foi:

```json
{
  "ok": false,
  "authenticated": false,
  "source": "legacy",
  "identity": {
    "id": null,
    "email": "",
    "nome": null,
    "authenticated": false
  },
  "globalRole": null,
  "membershipCount": 0,
  "memberships": [],
  "needsUnitSelection": false,
  "activeContext": null,
  "effectiveRole": null,
  "code": "GESTOR_UNAUTHORIZED"
}
```

### Unidade ausente ou invalida

- Antes de resolver memberships, o owner valida `req.body.unidade_id`
- Se o valor vier vazio ou sem formato ObjectId valido, responde `400`
- O payload observado usa o shape leve de mutacao, sem consultar memberships:

```json
{
  "ok": false,
  "authenticated": true,
  "source": "auth-context-v1",
  "identity": {
    "id": "507f1f77bcf86cd799439001",
    "email": "user@gestor.test",
    "nome": "Usuario Invalido",
    "authenticated": true
  },
  "globalRole": null,
  "membershipCount": 0,
  "memberships": [],
  "needsUnitSelection": false,
  "activeContext": null,
  "effectiveRole": null,
  "code": "GESTOR_INVALID_UNIDADE_ID"
}
```

### Resolvedor desligado

- Quando o resolvedor esta desligado e o contexto volta como `legacy`, `selectAuthUnit` nao executa selecao
- O owner responde `409` com o payload integral do auth context legacy e o codigo:

```json
"GESTOR_AUTH_CONTEXT_SELECTION_DISABLED"
```

### Selecao nao requerida

- Quando o resolvedor v1 retorna uma unica membership ou uma `activeContext` ja resolvida, `needsUnitSelection` fica `false`
- Nessa condicao, `selectAuthUnit` responde `409` com:

```json
"GESTOR_SELECTION_NOT_REQUIRED"
```

- O payload observado preserva o contexto resolvido atual em `memberships`, `activeContext` e `effectiveRole`

### Unidade fora das memberships ativas

- Quando `unidade_id` nao corresponde a nenhuma membership ativa do contexto v1, o owner responde `403`
- O codigo observado e:

```json
"GESTOR_UNIT_NOT_ALLOWED"
```

- O payload observado preserva o auth context atual sem `activeContext` quando ainda ha selecao pendente

### Sucesso

- Quando `unidade_id` corresponde a uma membership ativa e `needsUnitSelection` esta `true`, o owner:
  - persiste a selecao em `req.session.gestorAuthContext`
  - chama `req.session.save()` de forma graciosa
  - resolve novamente o auth context apos a mutacao
  - responde `200` com `ok: true`

- Campos persistidos observados em sessao:

```json
{
  "active_membership_id": "507f1f77bcf86cd799439303",
  "active_unidade_id": "507f191e810c19729de860eb",
  "active_unidade_principal_id": "507f191e810c19729de860eb",
  "active_papel_contextual": "user",
  "active_funcionario_id": "func-303",
  "legacy_role": "user",
  "needs_selection": false
}
```

- O payload HTTP observado apos re-resolver o contexto foi:

```json
{
  "ok": true,
  "authenticated": true,
  "source": "auth-context-v1",
  "identity": {
    "id": "507f1f77bcf86cd799439301",
    "email": "selecionar@gestor.test",
    "nome": "Usuario Selecionar",
    "authenticated": true
  },
  "globalRole": null,
  "membershipCount": 2,
  "memberships": [
    {
      "membershipId": "507f1f77bcf86cd799439302",
      "unidadeId": "507f191e810c19729de860ea",
      "unidadePrincipalId": "507f191e810c19729de860ff",
      "unidadeNome": "Filial Norte",
      "unidadeCodigo": "FN01",
      "papelContextual": "gestor",
      "legacyRole": "diretor"
    },
    {
      "membershipId": "507f1f77bcf86cd799439303",
      "unidadeId": "507f191e810c19729de860eb",
      "unidadePrincipalId": "507f191e810c19729de860eb",
      "unidadeNome": "Base Sul",
      "unidadeCodigo": "BS02",
      "papelContextual": "user",
      "legacyRole": "user"
    }
  ],
  "needsUnitSelection": false,
  "activeContext": {
    "membershipId": "507f1f77bcf86cd799439303",
    "unidadeId": "507f191e810c19729de860eb",
    "unidadePrincipalId": "507f191e810c19729de860eb",
    "papelContextual": "user",
    "funcionarioId": "func-303",
    "legacyRole": "user"
  },
  "effectiveRole": "user"
}
```

### Erro interno

- Excecao interna em `selectAuthUnit` cai no catch do owner e responde `500`
- O payload observado e o payload reduzido de mutacao com o codigo:

```json
{
  "ok": false,
  "authenticated": false,
  "source": "legacy",
  "identity": {
    "id": null,
    "email": "",
    "nome": null,
    "authenticated": false
  },
  "globalRole": null,
  "membershipCount": 0,
  "memberships": [],
  "needsUnitSelection": false,
  "activeContext": null,
  "effectiveRole": null,
  "code": "GESTOR_AUTH_CONTEXT_SELECTION_ERROR"
}
```

## Observacoes importantes do runtime

- Diferente de `GET /gestor/auth/context`, aqui o owner sempre exige `unidade_id` valido antes de resolver o contexto efetivo
- `selectAuthUnit` so opera quando o resolvedor retorna `source: auth-context-v1`
- O owner nao permite selecao quando `needsUnitSelection` ja e `false`; nesse caso retorna `GESTOR_SELECTION_NOT_REQUIRED`
- A autorizacao da escolha e puramente por pertinencia de `unidade_id` ao conjunto de memberships resolvidas; nao ha uso de `requireUnitScope` nesta rota
- O sucesso depende da segunda resolucao de auth context apos persistir a sessao, portanto o payload final ja sai com `activeContext` atualizado
- O caminho de erro `500` usa o payload reduzido de mutacao e nao reaproveita o auth context parcial

## Matriz coberta pela suite

- sem sessao no app real
- `unidade_id` invalido
- resolvedor desligado
- selecao nao requerida
- unidade fora das memberships ativas
- sucesso com persistencia em sessao e re-resolucao do contexto
- erro interno induzido

## Decisao final

- O microcorte seguro `POST /gestor/auth/select-unit` ficou congelado com caracterizacao focal verde
- Nenhum outro endpoint fora de `POST /gestor/auth/select-unit` foi aberto nesta rodada