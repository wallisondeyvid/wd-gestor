# Checkpoint: Gestor Unidades Provisioning Runtime Contract

Data: 2026-03-24
Branch: migration/refactor-core
HEAD: 4d8af986b9723991ef99f28a15e7b1fbe932bb06

## Escopo congelado

- `GET /gestor/api/unidades/:id/provisioning`

Sem reabrir:

- CRUD base de unidades
- logo/logo-inline
- endpoint público
- testing de banco
- toggle-access
- módulos por unidade
- provisioning/events
- provisioning/retry
- frontend

## Arquivo focal

- Suíte: `tests/gestor-unidades-provisioning-runtime-contract.test.js`

Comando validado:

```powershell
node --test .\tests\gestor-unidades-provisioning-runtime-contract.test.js
```

Resultado observado: 8 testes passando, 0 falhando.

## Contrato congelado

### 1. Sem sessão

No app real, `GET /gestor/api/unidades/:id/provisioning` responde `401` JSON sem sessão:

```json
{
  "success": false,
  "error": "Não autenticado",
  "code": "UNAUTHORIZED"
}
```

### 2. ID inválido

O owner atual possui validação explícita para `id` vazio após trim.

Quando `req.params.id` é vazio, responde `400` com:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "ID da unidade e obrigatorio."
}
```

### 3. Unidade inexistente

Quando `findUnidadeById(unidadeId)` não encontra a unidade, o owner responde `404`:

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Unidade nao encontrada"
}
```

### 4. Fora do escopo contextual

O owner carrega primeiro a unidade e depois valida acesso por `ensureCanAccessUnidade(req, unidade._id)`.

Se o alvo não pertencer ao cluster acessível, responde `400`:

```json
{
  "success": false,
  "code": "BAD_REQUEST",
  "message": "Acesso a unidade nao autorizado"
}
```

### 5. Sucesso com provisioning presente

Quando `inspectUnitProvisioning({ unidadeId })` devolve snapshot com dados, o owner responde `200` com o resultado de `normalizeProvisioningSnapshotResponse(snapshot)`.

Shape observado:

```json
{
  "success": true,
  "data": {
    "status": "ready",
    "lastRunAt": "2026-03-24T10:00:00.000Z",
    "modulosHabilitados": ["ponto", "escalas"],
    "modulosHabilitadosDisplay": ["Ponto", "Escalas"],
    "extra": { "ok": true }
  }
}
```

Observações do normalizador:

- preserva os demais campos do snapshot original
- trimma itens de `modulosHabilitados`
- remove itens vazios/falsy
- usa `modulosHabilitadosDisplay` normalizado quando ele vier preenchido

### 6. Sucesso com provisioning ausente ou vazio

Quando `inspectUnitProvisioning(...)` devolve `null`, o helper normaliza para objeto com arrays vazios:

```json
{
  "success": true,
  "data": {
    "modulosHabilitados": [],
    "modulosHabilitadosDisplay": []
  }
}
```

Quando o snapshot é `{}`, o contrato observado é o mesmo:

```json
{
  "success": true,
  "data": {
    "modulosHabilitados": [],
    "modulosHabilitadosDisplay": []
  }
}
```

### 7. Shape exato do payload observado

O owner não cria estrutura agregada adicional. O payload de sucesso é o próprio snapshot normalizado dentro de `data`.

Campos observáveis relevantes:

- quaisquer campos do snapshot original são preservados
- `modulosHabilitados` sempre sai como array de strings normalizadas
- `modulosHabilitadosDisplay` sempre sai como array; se vier vazio, cai para `modulosHabilitados`

### 8. Erro interno induzido

Quando `inspectUnitProvisioning` lança erro, o owner cai no `catch` externo e responde `500` com a mensagem original:

```json
{
  "success": false,
  "code": "SERVER_ERROR",
  "message": "forced-get-provisioning-failure"
}
```

## Observações importantes do runtime

- O gate sem sessão deste corredor é JSON `401`, não redirect.
- Diferente do microcorte de módulos, aqui o owner valida `id` vazio explicitamente antes do lookup.
- A validação contextual acontece depois do lookup da unidade, usando `unidade._id`.
- O fallback observável de provisioning ausente não é `null`: o normalizador devolve objeto com `modulosHabilitados: []` e `modulosHabilitadosDisplay: []`.
- O shape de sucesso é o snapshot normalizado simples, sem envelope adicional de metadados além de `success` e `data`.

## Decisão final

- Classificação: microcorte fechado com guardrail focal.
- Motivo: o gate de autenticação, a validação de id, o lookup da unidade, a validação contextual, o shape do snapshot normalizado e o fallback observável foram congelados por suíte isolada sem abrir events/retry nem o restante do corredor.

## Confirmação explícita

- Produção não foi alterada.
- Controller não foi alterado.
- Route não foi alterada.
- Frontend não foi alterado.
- Testes antigos não foram alterados.
- Checkpoints antigos não foram alterados.
- Apenas a suíte focal nova e este checkpoint novo foram criados nesta rodada.