# Checkpoint: Gestor Auth Login Post-Auth Runtime Contract

Data: 2026-03-24
Escopo: caracterizacao runtime conservadora do microcorte pos-autenticacao de POST /gestor/login
Suite focal: tests/gestor-auth-login-post-auth-runtime-contract.test.js
Execucao focal: node --experimental-test-module-mocks --test .\tests\gestor-auth-login-post-auth-runtime-contract.test.js
Resultado: 6 testes passando

## Snapshot operacional

- Branch: migration/refactor-core
- HEAD observado na abertura da rodada: f153c8f2ecdc33b22b7fe4a8ac5e910ef4424f5f
- Worktree ja estava sujo apenas com artefatos locais novos de Funcoes e auth context; nada foi limpo
- Sem patch de producao nesta rodada

## Wiring confirmado

- O corredor live continua exposto por authRouter montado externamente sob /gestor
- A rota canonica desta subfase e POST /gestor/login
- O microcorte congelado começa apos a autenticacao bem-sucedida, quando o owner:
  - limpa req.session.gestorAuthContext anterior
  - grava req.session.user minimo
  - opcionalmente resolve o auth context v1
  - classifica o resultado como pronto, needs-selection, no-context ou erro
- Nenhum outro corredor fora desse trecho foi aberto nesta rodada

## Gate necessario confirmado no app real

- O gate de wiring do login permaneceu estavel no app real: sem credenciais, POST /gestor/login responde 303 para /gestor/login?erro=usuario
- Esse caso foi usado apenas para fixar o mount e o prefixo canonico do login, sem abrir o restante do owner

## Contrato observado no microcorte pos-auth

### Resolvedor desligado

- Com autenticacao bem-sucedida e o resolvedor desligado, o owner nao tenta materializar auth context v1
- O login segue com a sessao minima:

```json
{
  "user": {
    "id": "507f1f77bcf86cd799439901",
    "email": "login@gestor.test"
  }
}
```

- Nenhum req.session.gestorAuthContext e persistido
- O resultado observado desse trecho, com o restante do login estabilizado para nao abrir outros ramos, foi redirect 303 para:

```text
/gestor/dashboard
```

### Resolvedor ligado com contexto pronto

- Com o resolvedor ligado e uma unica membership ativa, o auth context v1 ja nasce pronto no proprio login
- O owner persiste req.session.gestorAuthContext antes de seguir:

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

- req.session.user tambem e reprojetado com papel e unidade contextuais
- O resultado observado desse trecho foi redirect 303 para:

```text
/gestor/dashboard
```

### Resolvedor ligado com needsUnitSelection true

- Quando o resolvedor devolve memberships multiplas sem selecao ativa, o owner grava um auth context parcial em sessao
- O payload persistido observado foi:

```json
{
  "user_id": "507f1f77bcf86cd799439901",
  "user_email": "login@gestor.test",
  "global_role": null,
  "active_membership_id": null,
  "active_unidade_id": null,
  "active_unidade_principal_id": null,
  "active_papel_contextual": null,
  "active_funcionario_id": null,
  "legacy_role": null,
  "needs_selection": true
}
```

- O owner salva a sessao e encerra o trecho com redirect 303 para:

```text
/gestor/login?step=select
```

### Resolvedor ligado sem contexto valido

- Quando o resolvedor v1 autentica a identidade, mas nao entrega globalRole, activeContext nem needsUnitSelection, o owner classifica como no-context
- Nessa condicao o runtime observado:
  - remove req.session.gestorAuthContext
  - remove req.session.user
  - salva a sessao
  - responde com redirect 303 para:

```text
/gestor/login?erro=contexto
```

### Erro interno do resolvedor

- Excecao propagada por resolveGestorAuthContext cai no catch geral de login
- O runtime observado responde 303 para:

```text
/gestor/login?erro=servidor
```

- O owner tambem escreve o header:

```text
X-Login-Error: resolver-boom
```

- Nuance importante do runtime observado: como req.session.user minimo ja tinha sido gravado antes da falha, ele permanece na sessao; req.session.gestorAuthContext continua ausente e nao houve session.save() adicional

## Observacoes importantes do runtime

- O microcorte real do login encosta no auth context somente apos bcrypt, lockout e session.regenerate
- O redirect de needs-selection nasce no proprio login; ele nao depende de reabrir select-unit nessa etapa
- O redirect erro=contexto tambem nasce no proprio login quando o resolvedor v1 volta sem contexto utilizavel
- A persistencia de req.session.gestorAuthContext acontece antes do redirect final quando o source e auth-context-v1, inclusive no caso parcial com needs_selection true
- Quando o resolvedor esta desligado, o login nao deixa resquicio de gestorAuthContext em sessao; segue apenas com req.session.user minimo
- Erro do resolvedor nao limpa a sessao minima ja escrita; esse detalhe pertence ao contrato observado atual do runtime

## Matriz coberta pela suite

- gate necessario do login no app real sem credenciais
- resolvedor desligado no trecho pos-auth
- resolvedor ligado com contexto pronto
- resolvedor ligado com needsUnitSelection true
- resolvedor ligado sem contexto valido
- erro interno do resolvedor
- persistencia de auth context em sessao quando aplicavel

## Decisao final

- O microcorte pos-auth de POST /gestor/login ficou congelado com caracterizacao focal verde
- Nenhum outro ramo do login foi aberto nesta rodada: remember-me, first-login/reset e demais corredores permaneceram fora do escopo