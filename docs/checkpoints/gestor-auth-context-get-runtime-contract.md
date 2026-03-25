# Checkpoint: Gestor Auth Context Get Runtime Contract

Data: 2026-03-24
Escopo: caracterizacao runtime conservadora de GET /gestor/auth/context
Suite focal: tests/gestor-auth-context-get-runtime-contract.test.js
Execucao focal: node --test .\tests\gestor-auth-context-get-runtime-contract.test.js
Resultado: 6 testes passando

## Snapshot operacional

- Branch: migration/refactor-core
- HEAD observado na abertura da rodada: f153c8f2ecdc33b22b7fe4a8ac5e910ef4424f5f
- Worktree ja estava sujo apenas com artefatos locais novos de Funcoes; nada foi limpo
- Sem patch de producao nesta rodada

## Wiring confirmado

- O corredor live de auth context continua exposto por authRouter montado via `app.use('/', authRouter)`
- A rota canonica desta subfase e `GET /gestor/auth/context`
- O owner focal e `getAuthContext`
- Nenhum endpoint de mutacao de contexto foi aberto nesta rodada

## Contrato observado

### Sem sessao no app real

- `GET /gestor/auth/context` no app real responde `401` JSON
- O payload observado com o resolver desligado por feature flag no harness foi:

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
  "effectiveRole": null
}
```

### Contexto legado projetado da sessao

- Com o resolver desligado, o owner usa o caminho legacy de `resolveGestorAuthContext`
- Quando a sessao traz `role`, `unidade_id`, `unidade_principal_id` e `funcionario_id`, o owner projeta uma membership sintetica unica
- O `membershipId` observado e fixo: `legacy-active-context`
- Para `role: diretor`, o `papelContextual` observado vira `gestor` e o `effectiveRole` permanece `diretor`

Payload observado:

```json
{
  "ok": true,
  "authenticated": true,
  "source": "legacy",
  "identity": {
    "id": "user-legacy-1",
    "email": "diretor@gestor.test",
    "nome": "Diretora Legacy",
    "authenticated": true
  },
  "globalRole": null,
  "membershipCount": 1,
  "memberships": [
    {
      "membershipId": "legacy-active-context",
      "unidadeId": "507f191e810c19729de860ea",
      "unidadePrincipalId": "507f191e810c19729de860eb",
      "unidadeNome": null,
      "unidadeCodigo": null,
      "papelContextual": "gestor",
      "legacyRole": "diretor"
    }
  ],
  "needsUnitSelection": false,
  "activeContext": {
    "membershipId": "legacy-active-context",
    "unidadeId": "507f191e810c19729de860ea",
    "unidadePrincipalId": "507f191e810c19729de860eb",
    "papelContextual": "gestor",
    "funcionarioId": "func-legacy-1",
    "legacyRole": "diretor"
  },
  "effectiveRole": "diretor"
}
```

### Auth-context-v1 com global role

- Com a feature flag ligada e `global_role` presente, o resolvedor fecha o contexto sem consultar memberships
- O payload observado e global, sem `activeContext` e sem `needsUnitSelection`

```json
{
  "ok": true,
  "authenticated": true,
  "source": "auth-context-v1",
  "identity": {
    "id": "user-master-1",
    "email": "master@gestor.test",
    "nome": "Master Gestor",
    "authenticated": true
  },
  "globalRole": "master",
  "membershipCount": 0,
  "memberships": [],
  "needsUnitSelection": false,
  "activeContext": null,
  "effectiveRole": "master"
}
```

### Auth-context-v1 com memberships multiplas sem selecao ativa

- Quando o resolvedor recebe mais de uma membership e nao encontra selecao persistida em `existingAuthContext`, o owner responde `200`
- Nessa condicao, `needsUnitSelection` observado e `true`
- `activeContext` permanece `null`
- `effectiveRole` permanece `null`
- Cada membership observada e enriquecida com:
  - `membershipId`
  - `unidadeId`
  - `unidadePrincipalId`
  - `unidadeNome`
  - `unidadeCodigo`
  - `papelContextual`
  - `legacyRole`

### Auth-context-v1 com selecao ativa persistida

- Quando `req.session.gestorAuthContext.active_unidade_id` corresponde a uma membership carregada, o resolvedor seleciona esse contexto
- O owner observado responde `200` com:
  - `needsUnitSelection: false`
  - `activeContext` preenchido com a membership selecionada
  - `effectiveRole` igual ao `legacyRole` da membership ativa

### Erro interno

- Excecao interna em `resolveGestorAuthContext` cai no catch de `getAuthContext` e responde `500`
- O payload observado e reduzido e nao inclui `memberships`

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
  "needsUnitSelection": false,
  "activeContext": null,
  "effectiveRole": null,
  "code": "GESTOR_AUTH_CONTEXT_ERROR"
}
```

## Observacoes importantes do runtime

- Esta rota nao passa por `requireLogin`; o proprio owner devolve `401` quando o contexto resolvido nao esta autenticado
- O source do payload depende da feature flag do resolvedor; no gate sem sessao caracterizado no app real, o slice foi fixado com o resolver desligado
- O caminho legacy sintetiza uma membership unica a partir de `req.session.user` quando existe `role` contextual e `unidade_id`
- O caminho v1 deriva `unidadePrincipalId` ao enriquecer cada membership com `loadUnidadeById`
- A selecao ativa observada prioriza ids persistidos em `existingAuthContext`, especialmente `active_membership_id` e `active_unidade_id`
- No erro interno de `getAuthContext`, o payload observado nao reaproveita o shape completo de sucesso/401: `memberships` fica ausente

## Matriz coberta pela suite

- sem sessao no app real
- contexto legado sintetico por sessao
- auth-context-v1 com `global_role`
- auth-context-v1 com memberships multiplas sem selecao ativa
- auth-context-v1 com `active_unidade_id` persistido selecionando a membership correta
- erro interno induzido

## Decisao final

- O microcorte seguro `GET /gestor/auth/context` ficou congelado com caracterizacao focal verde
- Nenhum outro endpoint fora de `GET /gestor/auth/context` foi aberto nesta rodada