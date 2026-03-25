# Checkpoint: Gestor API Unidades Cluster Runtime Contract

Data: 2026-03-25
Escopo: caracterizacao runtime conservadora de GET /gestor/api/unidades/cluster como primeira borda da frente de autorizacao por unitScope
Suite focal: tests/gestor-api-unidades-cluster-runtime-contract.test.js
Execucao focal: node --experimental-test-module-mocks --test .\tests\gestor-api-unidades-cluster-runtime-contract.test.js
Resultado: 4 testes passando

## Snapshot operacional

- Branch: migration/refactor-core
- HEAD observado na abertura da rodada: f153c8f2ecdc33b22b7fe4a8ac5e910ef4424f5f
- Worktree ja estava sujo com artefatos focais anteriores; nada foi limpo
- Sem patch de producao nesta rodada

## Wiring confirmado

- A rota focal continua exposta em [src/modules/gestor/app/routes/api.js](src/modules/gestor/app/routes/api.js)
- O encadeamento observado dessa borda e `requireLogin -> requireUnitScope -> unidadesCluster`
- O login e o auth context permanecem apenas como contrato de suporte; esta rodada nao reabre esses corredores
- O harness desta rodada manteve o gestor-app e a rota reais, mas estabilizou apenas os gates de `requireLogin` e `requireUnitScope` e o handler final para isolar a borda autorizada sem arrastar corredores laterais de conexao/model

## Contrato observado

### Sem sessao

- GET /gestor/api/unidades/cluster responde `401`
- O handler focal nao e alcancado nessa condicao
- O payload reduzido observado no harness focal foi:

```json
{
	"ok": false,
	"code": "GESTOR_UNAUTHORIZED"
}
```

### Sessao legacy

- Quando a sessao entra como legado com `role`, `unidade_id` e `funcionario_id`, a borda responde `200`
- O shape focal observado do retorno foi:

```json
{
	"ok": true,
	"sessionUser": {
		"email": "legacy@gestor.test",
		"role": "diretor",
		"unidade_id": "507f191e810c19729de860ea",
		"funcionario_id": "func-legacy-811"
	},
	"sessionAuthContext": null,
	"user": {
		"email": "legacy@gestor.test",
		"role": "diretor",
		"unidade_id": "507f191e810c19729de860ea",
		"funcionario_id": "func-legacy-811"
	},
	"unitScope": {
		"type": "unit",
		"unidadeId": "507f191e810c19729de860ea"
	}
}
```

### Sessao auth-context-v1 com active_unidade_id persistido

- Quando a sessao entra com `req.session.user` projetado do auth context e `req.session.gestorAuthContext.active_unidade_id` persistido, a borda responde `200`
- O contrato observado preserva continuidade entre sessao, `req.user` e `req.unitScope`

```json
{
	"ok": true,
	"sessionUser": {
		"unidade_id": "507f191e810c19729de860ea",
		"funcionario_id": "func-ctx-901"
	},
	"sessionAuthContext": {
		"active_unidade_id": "507f191e810c19729de860ea",
		"active_funcionario_id": "func-ctx-901"
	},
	"user": {
		"email": "contexto@gestor.test",
		"role": "diretor",
		"unidade_id": "507f191e810c19729de860ea",
		"funcionario_id": "func-ctx-901"
	},
	"unitScope": {
		"type": "unit",
		"unidadeId": "507f191e810c19729de860ea"
	}
}
```

### Erro interno relevante neste recorte

- Quando a reidratacao por email no gestor-app lanca excecao, a borda continua apoiada na sessao
- O runtime focal observado responde `200` e mantem `unitScope` derivado da sessao

```json
{
	"ok": true,
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

## Observacoes importantes do runtime

- O primeiro microcorte da frente de unitScope pode ser tratado como borda de autorizacao, nao como contrato de negocio do cluster em si
- Nesta rodada, o retorno congelado e um shape focal de borda, suficiente para provar continuidade entre `req.session.user`, `req.session.gestorAuthContext`, `req.user` e `req.unitScope`
- O comportamento sem sessao nesta borda ficou fixado como `401`, nao redirect
- Com sessao valida, o estado de unidade chega coerente ao handler focal tanto no legado quanto no auth-context-v1
- Erro interno na reidratacao por email nao derruba automaticamente a borda quando a sessao ainda contem contexto suficiente para derivar `unitScope`

## Decisao final

- GET /gestor/api/unidades/cluster ficou congelado como primeiro microcorte seguro da frente de autorizacao por unitScope
- Nenhum endpoint com alvo por parametro foi aberto nesta rodada
- O proximo passo natural, fora desta entrega, passa a ser um endpoint com alvo explicito por id, onde o guardrail de fail-open por `unitScope` realmente vira risco principal