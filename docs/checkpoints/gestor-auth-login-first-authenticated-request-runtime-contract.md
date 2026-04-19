# Checkpoint: Gestor Auth Login First Authenticated Request Runtime Contract

Data: 2026-03-25
Escopo: caracterizacao runtime conservadora da costura entre o microcorte pos-auth de POST /gestor/login e o primeiro consumidor autenticado em GET /gestor/api/unidades/cluster
Suite focal: tests/gestor-auth-login-first-authenticated-request-runtime-contract.test.js
Execucao focal: node --experimental-test-module-mocks --test .\tests\gestor-auth-login-first-authenticated-request-runtime-contract.test.js
Resultado: 5 testes passando

## Snapshot operacional

- Branch: migration/refactor-core
- HEAD observado na abertura da rodada: f153c8f2ecdc33b22b7fe4a8ac5e910ef4424f5f
- Worktree ja estava sujo com checkpoints e suites focais anteriores nao rastreados; nada foi limpo
- Sem patch de producao nesta rodada

## Wiring confirmado

- O corredor de login continua exposto por authRouter montado em [src/modules/gestor/app/routes/auth.js](src/modules/gestor/app/routes/auth.js)
- O primeiro consumidor autenticado focal permanece em GET /gestor/api/unidades/cluster, exposto por [src/modules/gestor/app/routes/api.js](src/modules/gestor/app/routes/api.js)
- A reidratacao real de req.user continua acontecendo no middleware global de [src/modules/gestor/app/gestor-app.js](src/modules/gestor/app/gestor-app.js)
- O harness desta rodada manteve o gestor-app real e o login real, mas estabilizou apenas os gates da borda do consumidor autenticado para nao arrastar modelos e corredores laterais fora do recorte

## Contrato observado

### Sem sessao no primeiro consumidor autenticado

- GET /gestor/api/unidades/cluster responde 302
- O redirect observado foi:

```text
/gestor/login
```

- O handler do consumidor nao e alcancado nessa condicao

### Sessao legacy

- Quando a sessao ja entra com user legacy contextual e a reidratacao por email encontra um userDoc compativel, o primeiro consumidor autenticado responde 200
- O payload observado no handler focal preserva o contexto efetivo em req.user:

```json
{
	"email": "legacy@gestor.test",
	"role": "diretor",
	"unidade_id": "507f191e810c19729de860ea",
	"funcionario_id": "func-legacy-811"
}
```

### Sessao auth-context-v1 com active_unidade_id persistido

- Quando a sessao entra com req.session.user projetado do auth context v1 e req.session.gestorAuthContext com active_unidade_id persistido, o estado persistido continua presente no primeiro request autenticado
- O payload observado no handler focal preserva em sessao:

```json
{
	"user_id": "507f1f77bcf86cd799439901",
	"user_email": "contexto@gestor.test",
	"global_role": null,
	"active_membership_id": "507f1f77bcf86cd799439902",
	"active_unidade_id": "507f191e810c19729de860ea",
	"active_unidade_principal_id": "507f191e810c19729de860ea",
	"active_papel_contextual": "gestor",
	"active_funcionario_id": "func-ctx-901",
	"legacy_role": "diretor",
	"needs_selection": false
}
```

- A reidratacao real de req.user continua consultando o userDoc por email, mas preserva os campos contextuais ja projetados na sessao quando o marcador canonico esta presente
- No runtime observado apos o patch focal, req.user chega ao primeiro consumidor com:

```json
{
	"email": "contexto@gestor.test",
	"role": "diretor",
	"unidade_id": "507f191e810c19729de860ea",
	"funcionario_id": "func-ctx-901"
}
```

### Continuidade do papel e do contexto efetivo no fluxo login -> primeiro request autenticado

- No fluxo com POST /gestor/login bem-sucedido e resolvedor ligado com uma membership ativa, o login persiste a sessao contextual como ja congelado no microcorte pos-auth
- O redirect observado do login permanece:

```text
/gestor/dashboard
```

- No primeiro GET /gestor/api/unidades/cluster com o mesmo cookie:
	- req.session.user ainda carrega o papel e o contexto projetados pelo login
	- req.session.gestorAuthContext ainda carrega active_unidade_id e active_funcionario_id
	- req.user e reidratado a partir do userDoc por email, preservando unidade_id e funcionario_id contextuais da sessao

- Payload observado no primeiro consumidor:

```json
{
	"sessionUser": {
		"role": "diretor",
		"unidade_id": "507f191e810c19729de860ea",
		"funcionario_id": "func-922"
	},
	"sessionAuthContext": {
		"active_unidade_id": "507f191e810c19729de860ea"
	},
	"user": {
		"email": "login-continuity@gestor.test",
		"role": "diretor",
		"unidade_id": "507f191e810c19729de860ea",
		"funcionario_id": "func-922"
	}
}
```

### Erro interno relevante neste recorte

- Quando a consulta de reidratacao por email em [src/modules/gestor/app/gestor-app.js](src/modules/gestor/app/gestor-app.js) lanca excecao, o middleware global captura o erro e nao derruba a requisicao
- No runtime observado para sessao legacy sem marcador autoritativo:
	- req.user chega nulo ao consumidor
	- req.session.user permanece intacto
	- a borda focal ainda segue apoiada na sessao e alcanca o handler com 200

- Payload observado:

```json
{
	"user": null,
	"sessionUser": {
		"email": "erro@gestor.test",
		"unidade_id": "507f191e810c19729de860ea"
	},
	"unitScope": {
		"type": "unit",
		"unidadeId": "507f191e810c19729de860ea"
	}
}
```

### Erro interno com contexto autoritativo persistido

- Quando a reidratacao por email falha, mas a sessao ja traz projecao canonica marcada por `auth_version=phase3` e `gestorAuthContext` ativo, o bootstrap recompõe `req.user` a partir da sessao canonica antes do primeiro consumidor autenticado
- No runtime observado:
	- `req.session.user` permanece intacto
	- `req.user` nao chega mais nulo ao consumidor nesse caminho autoritativo degradado
	- unidade_id e funcionario_id continuam coerentes com `gestorAuthContext`

- Payload observado:

```json
{
	"sessionUser": {
		"email": "erro-contexto@gestor.test",
		"unidade_id": "507f191e810c19729de860ea"
	},
	"user": {
		"email": "erro-contexto@gestor.test",
		"role": "diretor",
		"unidade_id": "507f191e810c19729de860ea",
		"funcionario_id": "func-952"
	}
}
```

## Observacoes importantes do runtime

- O middleware de reidratacao em [src/modules/gestor/app/gestor-app.js](src/modules/gestor/app/gestor-app.js) continua consultando o userDoc por email
- Com o patch focal deste recorte, quando a sessao ja traz projecao canonica marcada por auth_version ou gestorAuthContext ativo, req.user preserva unidade_id e funcionario_id contextuais em vez de apaga-los
- O comportamento observado no fluxo login -> primeiro request autenticado deixa de ser assimetrico para esses dois campos: sessao contextual integra e req.user coerente em unidade e funcionario
- No recorte focal desta rodada, erro interno na reidratacao nao invalida automaticamente a sessao; para sessao legacy o consumidor ainda consegue seguir apoiado nos dados persistidos em sessao, mas para sessao autoritativa o bootstrap volta a entregar req.user coerente sem depender desse fallback como fonte principal

## Decisao final

- O primeiro consumidor autenticado apos o login ficou congelado com caracterizacao focal verde
- O patch focal removeu o residual honesto deste recorte para unidade_id e funcionario_id, sem reabrir o corredor de login nem o auth context
- Nenhum corredor lateral foi aberto nesta rodada fora da costura login -> primeiro request autenticado