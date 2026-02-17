# WD Gestor — API Condomínios V2 Contract

## 1. Princípios do contrato
- Compatibilidade garantida com o comportamento legado validado por parity OFF/ON.
- Estrutura de payload padrão de erro normalizada no plano V2: `error` obrigatório e `success: false`.
- Semântica de erro estável por status HTTP; sem alteração de lógica de negócio.
- Garantias de estabilidade orientadas por testes de paridade byte-a-byte.

## 2. Estrutura global de resposta

### 2.1 Sucesso
```json
{
  "success": true,
  "data": {}
}
```
No módulo Condomínios V2 atual, respostas de sucesso observadas retornam payload direto (array/objeto), sem envelope `success/data`.

### 2.2 Erro padrão
```json
{
  "success": false,
  "error": "mensagem"
}
```
Observação: o campo `code` só aparece em modo debug (`WDG_DEBUG_ERRORS=1`).

Exemplo com debug:
```json
{
  "success": false,
  "error": "DB indisponível",
  "code": "DB_UNAVAILABLE"
}
```

## 3. Endpoints documentados

### [GET] /condominios/api/unidades
Descrição funcional: lista unidades acessíveis no contexto do usuário.

Query params:

| Parâmetro | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `search` | string | não | Aceito e encaminhado no fluxo de listagem contextual. |
| `unidadeId` | string | não | Aceito no fluxo de consulta contextual. |

Payload sucesso (exemplo real):
```json
[
  {
    "_id": "000000000000000000000001",
    "codigo": "U-001",
    "nome": "Condomínio Exemplo"
  }
]
```

Payload erro (exemplo real):
```json
{
  "success": false,
  "error": "Falha ao listar unidades"
}
```

Status HTTP possíveis:
- `200`
- `503` (com header `Retry-After: 5`)
- `500`

Garantias do contrato:
- Nunca pode mudar:
  - Resposta de sucesso em JSON válido.
  - Resposta de erro em JSON válido, sem HTML.
  - Em `503`, header `Retry-After` presente.
- Pode evoluir:
  - Inclusão de campos adicionais no payload de sucesso.

---

### [GET] /condominios/api/unidades/:id
Descrição funcional: obtém unidade por identificador.

Query params: nenhum.

Payload sucesso (exemplo real):
```json
{
  "_id": "000000000000000000000001",
  "codigo": "U-001",
  "nome": "Condomínio Exemplo"
}
```

Payload erro (exemplo real):
```json
{
  "success": false,
  "error": "Identificador inválido"
}
```

Status HTTP possíveis:
- `200`
- `400`
- `404`
- `503` (com header `Retry-After: 5`)
- `500`

Garantias do contrato:
- Nunca pode mudar:
  - `400` para identificador inválido.
  - `404` para recurso inexistente.
- Pode evoluir:
  - Campos adicionais de unidade no sucesso.

---

### [GET] /condominios/api/unidades/relacionadas
Descrição funcional: lista unidades relacionadas por filtros de condomínio/bloco/andar.

Query params:

| Parâmetro | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `condominioId` | string(ObjectId) | não | Filtra por unidade específica. |
| `blocoId` | string(ObjectId) | não | Resolve unidade via bloco. |
| `andarId` | string(ObjectId) | não | Resolve unidade via andar. |

Payload sucesso (exemplo real):
```json
[]
```

Payload erro (exemplo real):
```json
{
  "success": false,
  "error": "DB indisponível"
}
```

Status HTTP possíveis:
- `200`
- `503` (com header `Retry-After: 5`)
- `500`

Garantias do contrato:
- Nunca pode mudar:
  - Quando não houver correspondência, resposta é array JSON (possivelmente vazio).
- Pode evoluir:
  - Campos adicionais no objeto de unidade.

---

### [GET] /condominios/api/blocos
Descrição funcional: lista blocos ativos por unidade ou por escopo do usuário.

Query params:

| Parâmetro | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `unidade` | string(ObjectId) | não | Alias de `unidade_id`. |
| `unidade_id` | string(ObjectId) | não | Filtro de unidade. Se inválido, retorna `[]`. |

Payload sucesso (exemplo real):
```json
[
  {
    "_id": "000000000000000000000010",
    "nome": "Bloco A",
    "unidade_id": "000000000000000000000001",
    "ordem": 0
  }
]
```

Payload erro (exemplo real):
```json
{
  "success": false,
  "error": "DB indisponível"
}
```

Status HTTP possíveis:
- `200`
- `503` (com header `Retry-After: 5`)
- `500`

Garantias do contrato:
- Nunca pode mudar:
  - `unidade_id` inválido não gera `500`; retorna array válido.
  - Resposta de sucesso sempre array JSON.
- Pode evoluir:
  - Novos campos em cada bloco.

---

### [GET] /condominios/api/blocos/:id
Descrição funcional: obtém bloco por identificador.

Query params: nenhum.

Payload sucesso (exemplo real):
```json
{
  "_id": "000000000000000000000010",
  "nome": "Bloco A",
  "unidade_id": "000000000000000000000001",
  "ordem": 0
}
```

Payload erro (exemplo real):
```json
{
  "success": false,
  "error": "Bloco não encontrado"
}
```

Status HTTP possíveis:
- `200`
- `400`
- `404`
- `503` (com header `Retry-After: 5`)
- `500`

Garantias do contrato:
- Nunca pode mudar:
  - `400` para id inválido.
  - `404` para bloco inexistente.
- Pode evoluir:
  - Campos adicionais no bloco retornado.

---

### [GET] /condominios/api/blocos/relacionados
Descrição funcional: lista blocos relacionados por filtros de condomínio/bloco/andar.

Query params:

| Parâmetro | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `condominioId` | string(ObjectId) | não | Filtro por unidade. |
| `blocoId` | string(ObjectId) | não | Filtro direto de bloco. |
| `andarId` | string(ObjectId) | não | Resolve unidade via andar. |

Payload sucesso (exemplo real):
```json
[]
```

Payload erro (exemplo real):
```json
{
  "success": false,
  "error": "Falha ao listar blocos relacionados"
}
```

Status HTTP possíveis:
- `200`
- `503` (com header `Retry-After: 5`)
- `500`

Garantias do contrato:
- Nunca pode mudar:
  - Resposta de sucesso é array JSON.
- Pode evoluir:
  - Campos adicionais por item.

---

### [GET] /condominios/api/andares
Descrição funcional: lista andares ativos por unidade ou por escopo do usuário.

Query params:

| Parâmetro | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `unidade` | string(ObjectId) | não | Alias de `unidade_id`. |
| `unidade_id` | string(ObjectId) | não | Filtro de unidade. Inválido retorna `400`. |

Payload sucesso (exemplo real):
```json
[
  {
    "_id": "000000000000000000000020",
    "nome": "1º Andar",
    "numero": 1,
    "unidade_id": "000000000000000000000001",
    "ordem": 0
  }
]
```

Payload erro (exemplo real):
```json
{
  "success": false,
  "error": "unidade_id inválido"
}
```

Status HTTP possíveis:
- `200`
- `400`
- `503` (com header `Retry-After: 5`)
- `500`

Garantias do contrato:
- Nunca pode mudar:
  - `400` para `unidade_id` inválido.
- Pode evoluir:
  - Campos adicionais por item.

---

### [GET] /condominios/api/andares/:id
Descrição funcional: obtém andar por identificador.

Query params: nenhum.

Payload sucesso (exemplo real):
```json
{
  "_id": "000000000000000000000020",
  "nome": "1º Andar",
  "numero": 1,
  "unidade_id": "000000000000000000000001",
  "ordem": 0
}
```

Payload erro (exemplo real):
```json
{
  "success": false,
  "error": "Andar não encontrado"
}
```

Status HTTP possíveis:
- `200`
- `400`
- `404`
- `503` (com header `Retry-After: 5`)
- `500`

Garantias do contrato:
- Nunca pode mudar:
  - `400` para id inválido.
  - `404` para recurso inexistente.
- Pode evoluir:
  - Campos adicionais do objeto.

---

### [GET] /condominios/api/andares/relacionados
Descrição funcional: lista andares relacionados por filtros de condomínio/bloco/andar.

Query params:

| Parâmetro | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `condominioId` | string(ObjectId) | não | Filtro de unidade. |
| `blocoId` | string(ObjectId) | não | Resolve unidade via bloco. |
| `andarId` | string(ObjectId) | não | Filtro direto de andar. |

Payload sucesso (exemplo real):
```json
[]
```

Payload erro (exemplo real):
```json
{
  "success": false,
  "error": "DB indisponível"
}
```

Status HTTP possíveis:
- `200`
- `503` (com header `Retry-After: 5`)
- `500`

Garantias do contrato:
- Nunca pode mudar:
  - Resposta de sucesso é array JSON.
- Pode evoluir:
  - Campos adicionais por item.

---

### [POST] /condominios/api/blocos
Descrição funcional: cria bloco; idempotente por (`unidade_id`, `nome`).

Query params: nenhum.

Body JSON:

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `unidade_id` | string | sim | Identificador da unidade. |
| `nome` | string | sim | Nome do bloco. |
| `ordem` | number | não | Default `0`. |

Payload sucesso (exemplo real):
```json
{
  "_id": "000000000000000000000030",
  "unidade_id": "000000000000000000000001",
  "nome": "Bloco C",
  "ordem": 0
}
```

Payload erro (exemplo real):
```json
{
  "success": false,
  "error": "unidade_id e nome são obrigatórios"
}
```

Status HTTP possíveis:
- `200` (idempotência: já existente)
- `201` (criado)
- `400`
- `409`
- `503` (com header `Retry-After: 5`)
- `500`

Garantias do contrato:
- Nunca pode mudar:
  - Idempotência para criação duplicada por (`unidade_id`, `nome`).
  - `409` para conflito de duplicidade.
- Pode evoluir:
  - Campos adicionais no objeto retornado.

---

### [PUT] /condominios/api/blocos/:id
Descrição funcional: atualiza campos de bloco.

Query params: nenhum.

Body JSON:

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `nome` | string | não | Se informado, é normalizado (`trim`). |
| `ordem` | number | não | Se informado, normalizado para número. |
| `ativo` | boolean | não | Se informado, convertido para booleano. |

Payload sucesso (exemplo real):
```json
{
  "_id": "000000000000000000000030",
  "unidade_id": "000000000000000000000001",
  "nome": "Bloco C Atualizado",
  "ordem": 1,
  "ativo": true
}
```

Payload erro (exemplo real):
```json
{
  "success": false,
  "error": "Falha ao atualizar bloco"
}
```

Status HTTP possíveis:
- `200`
- `500`

Garantias do contrato:
- Nunca pode mudar:
  - Resposta JSON válida em sucesso e erro.
- Pode evoluir:
  - Campos adicionais no objeto retornado.

---

### [DELETE] /condominios/api/blocos/:id
Descrição funcional: remove bloco por identificador.

Query params: nenhum.

Payload sucesso (exemplo real):
```json
{
  "ok": true
}
```

Payload erro (exemplo real):
```json
{
  "success": false,
  "error": "Falha ao excluir bloco"
}
```

Status HTTP possíveis:
- `200`
- `500`

Garantias do contrato:
- Nunca pode mudar:
  - Resposta de sucesso com JSON válido.
- Pode evoluir:
  - Inclusão de metadados adicionais no sucesso.

## 4. Regras de compatibilidade
- Campos existentes não são removidos sem atualização formal de parity e contrato.
- Campos opcionais podem ser adicionados sem quebrar compatibilidade.
- Estrutura base de erro permanece JSON com `error` e `success: false`.
- Erros nunca retornam HTML; retorno é sempre JSON válido.
- Em status `503` tratados por contrato, `Retry-After` permanece estável.
- Estrutura de sucesso permanece JSON válido (array ou objeto conforme endpoint).

## 5. Notas de parity
- Testes de parity são a fonte de verdade operacional do contrato V2.
- Este contrato é derivado do comportamento validado por parity OFF/ON.
- Qualquer alteração de payload, header, status ou semântica exige atualização explícita dos testes parity antes de adoção.
