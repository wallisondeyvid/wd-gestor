# Checkpoint: Gestor Modulos Update Runtime Contract

Data: 2026-03-25
Branch: migration/refactor-core
HEAD: f153c8f2ecdc33b22b7fe4a8ac5e910ef4424f5f

## Escopo congelado

- PUT /gestor/api/modulos/:id

Sem reabrir:

- GET /gestor/api/modulos
- GET /gestor/api/modulos/:id
- POST /gestor/api/modulos
- DELETE /gestor/api/modulos/:id
- frontend
- produção

## Arquivo focal

- Suite: tests/gestor-modulos-update-runtime-contract.test.js

Comando validado:

```powershell
node --test .\tests\gestor-modulos-update-runtime-contract.test.js
```

Resultado observado: 4 testes passando, 0 falhando.

## Snapshot e wiring confirmado

- No sub-app real, o mount do corredor permanece via moduloApiRouter em src/modules/gestor/app/gestor-app.js.
- A rota focal permanece registrada como PUT /api/modulos/:id em src/modules/gestor/app/routes/moduloApi.js.
- O router aplica requireLogin no corredor inteiro antes do handler.
- O owner focal permanece em atualizarModulo, dentro de src/modules/gestor/app/controllers/moduloApiController.js.

## Contrato validado

### 1. Regra explicita de permissao

Quando req.user nao existe ou quando req.user.role nao e master nem admin, o owner responde 400:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "Permissão insuficiente"
}
```

### 2. Alvo inexistente por id

Quando findModuloById(req.params.id) nao encontra o alvo, o owner responde 404:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Módulo não encontrado"
}
```

### 3. Duplicidade de nome quando o nome muda

Quando o body traz nome diferente do nome atual do modulo e findModuloByNome(nome) encontra duplicado, o owner responde 400:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "Nome de módulo já em uso"
}
```

Observacao validada:

- a consulta de duplicidade so acontece quando nome existe no body e e diferente de modulo.nome

### 4. Caminho feliz minimo

No caminho feliz validado, o owner:

- encontra o modulo por id
- atualiza nome, descricao, status e url_base quando esses campos sao fornecidos
- persiste via saveModulo
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
  "_id": "m-ok",
  "nome": "Modulo Renovado",
  "descricao": "Descricao nova",
  "status": "inativo",
  "url_base": "/novo-modulo"
}
```

## Limites desta caracterizacao

- Esta rodada nao validou o gate 401 sem sessao no app real.
- Esta rodada nao validou erro interno generico.
- Esta rodada nao validou comportamento com body parcial alem do caminho feliz minimo acima.
- O checkpoint congela apenas o contrato efetivamente coberto pela suite focal nova.

## Decisao final

- Classificacao: microcorte focal aberto e caracterizado com sucesso.
- Motivo: PUT /gestor/api/modulos/:id agora tem suite e checkpoint proprios cobrindo permissao, alvo inexistente, duplicidade nominal e caminho feliz, sem qualquer patch de producao.