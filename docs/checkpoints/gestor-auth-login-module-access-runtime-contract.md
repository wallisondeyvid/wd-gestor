# Checkpoint: Gestor Auth Login Module Access Runtime Contract

Data: 2026-03-25
Escopo: caracterizacao runtime conservadora apenas do subtrecho de autorizacao ao modulo-alvo dentro de POST /gestor/login
Suite focal: tests/gestor-auth-login-module-access-runtime-contract.test.js
Execucao focal: node --experimental-test-module-mocks --test .\tests\gestor-auth-login-module-access-runtime-contract.test.js
Resultado: 3 testes passando

## Wiring confirmado

- O corredor continua exposto por authRouter montado via app.use('/', authRouter) no gestor-app.
- A rota canônica do recorte permanece POST /gestor/login.
- O owner real continua sendo login em src/modules/gestor/app/controllers/authController.js.
- O gate interno real deste microcorte é verificarAcessoModulo, chamado no trecho final do login antes do redirect definitivo.

## Limite deliberado do microcorte

- Este checkpoint nao reabre autenticacao, bcrypt, lockout, session.regenerate, remember-me, primeiro acesso, resolucao completa de auth context nem o primeiro request autenticado.
- O foco aqui e somente a decisao de acesso ao modulo-alvo depois que a identidade ja foi autenticada e o contexto ja ficou pronto o suficiente para chegar ao gate.

## Contrato observado

### Negacao para diretor contextualizado sem modulo habilitado na unidade

- Quando o login ja resolve um contexto pronto para diretor e a unidade efetiva nao possui o modulo-alvo em modulosAcessiveis, o gate nega o acesso.
- O runtime observado redireciona para:

```text
/gestor/login?erro=modulo&motivo=modulo_nao_habilitado_unidade
```

- O contexto resolvido ja tinha sido persistido em sessao antes da negacao:

```json
{
  "user_id": "507f1f77bcf86cd799439901",
  "user_email": "login@gestor.test",
  "global_role": null,
  "active_membership_id": "507f1f77bcf86cd799439902",
  "active_unidade_id": "507f191e810c19729de860ea",
  "active_unidade_principal_id": "507f191e810c19729de860ea",
  "active_papel_contextual": "gestor",
  "active_funcionario_id": "func-902",
  "legacy_role": "diretor",
  "needs_selection": false
}
```

### Negacao para user contextualizado sem funcao

- Quando o login ja resolve um contexto pronto para um user e o gate encontra funcionario vinculado sem funcao_id, o acesso ao modulo-alvo e negado.
- O runtime observado redireciona para:

```text
/gestor/login?erro=modulo&motivo=user_sem_funcao
```

### Caminho permitido

- Quando o contexto pronto do diretor aponta para uma unidade com o modulo-alvo habilitado, o gate permite o acesso.
- O runtime observado segue com redirect 303 para:

```text
/gestor/dashboard
```

- A sessao projetada permanece coerente com o contexto efetivo:
  - session.user.role = diretor
  - session.user.unidade_id = unidade ativa contextual

## Matriz coberta pela suite

- negacao com motivo concreto modulo_nao_habilitado_unidade
- negacao com motivo concreto user_sem_funcao
- caminho permitido para diretor contextualizado com modulo habilitado

## Decisao final

- O residual honesto do gate de autorizacao ao modulo-alvo dentro de POST /gestor/login ficou congelado localmente neste microcorte.
- Nenhum outro trecho do login foi reaberto nesta rodada.