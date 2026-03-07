# Gestor - Provisioning Contract (Canonical)

Fonte de verdade deste documento:

- `src/modules/gestor/app/usecases/unit-provisioning/UnitProvisioningService.js`
- `src/modules/gestor/app/repositories/UnitProvisioningRepository.js`
- `src/modules/gestor/app/usecases/unit-provisioning/module-bootstrap/*.js`
- `src/modules/gestor/app/controllers/unidadeApiController.js`
- `src/modules/gestor/app/routes/unidadeApi.js`
- `public/gestor/js/modals/detalhes_unidades.js`
- `tests/gestor.provisioning.retry.test.js`

Data de consolidacao: 2026-03-06.

## 1) Modelo canonico

- Tenant base: `unidade`.
- Identificador canonico do tenant: `unidadeId`.
- Banco do tenant por unidade: `dbName = wdgestor_unit_<unidadeId>`.
- Modulos (`modulosHabilitados`) sao capacidades sobre a mesma unidade/tenant base.
- Snapshot canonico em `unit_provisioning_status` usa `snapshotVersion = unit-tenant-v1`.

No snapshot, o descritor de tenant base e persistido em `tenantBase`:

- `tenantBase.model` (atual: `unidade`)
- `tenantBase.unidadeId`
- `tenantBase.dbName`

## 2) Persistencia do provisioning

Colecoes globais:

- `unit_provisioning_status`: estado atual da unidade (snapshot).
- `unit_provisioning_events`: trilha historica de eventos de provisioning.

Colecao tecnica por tenant base (db da unidade):

- `__unit_provisioning` com marcador `unit_provisioned`.

Colecoes tecnicas por modulo (db da unidade):

- Condominio: `__mod_condominio_bootstrap` (`module_condominio_ready`).
- Clinica: `__mod_clinica_bootstrap` (`module_clinica_ready`) e dominio `clinica_cadastros`.
- Escalas: `__mod_escalas_bootstrap` (`module_escalas_ready`) e dominio `escalas_cadastros`.

No dominio `clinica_cadastros` (bootstrap Clinica):

- As chaves canonicas permanecem: `empresas`, `pacientes`, `profissionais`, `planos`, `procedimentos`.
- O bootstrap atual semeia `label`, `path`, `active`, `schemaVersion`, `source` e tambem `payload` por cadastro.
- `payload` representa metadados de dominio do modulo Clinica (enriquecimento aditivo).
- Esse enriquecimento nao altera tenant base, contrato principal de provisioning, `moduleStatuses` ou trilha historica.

No dominio `escalas_cadastros` (bootstrap Escalas):

- O bootstrap de Escalas nao e mais apenas marcador tecnico.
- Mantem o marcador tecnico legado `__mod_escalas_bootstrap` (`module_escalas_ready`) por compatibilidade.
- Provisiona colecao de dominio minima real (`escalas_cadastros`) com indice unico por `key` (`uk_key`).
- Executa seed idempotente por `key` (upsert) de catalogos reais do modulo.
- Chaves canonicas atuais do seed: `status_escala`, `classificacoes_escala`, `tipos_refeicao`, `contextos_log_escala`, `acoes_log_escala`, `modelo_schema_escala`.
- Esse enriquecimento nao altera tenant base, contrato principal de provisioning, `moduleStatuses` ou trilha historica.

## 3) Provisioning global da unidade

Use case: `ensureUnitProvisioned({ unidadeId, tipo, modulosHabilitados })`.

Passos principais:

1. Registra evento `unit_provisioning_started` (`operation: ensure`).
2. Executa `ensureBaseIndexes` no tenant base.
3. Executa bootstrap por modulo via `dispatchModuleBootstraps`.
4. Registra eventos de bootstrap de modulo (`module_bootstrap_*`).
5. Faz upsert do snapshot global em `unit_provisioning_status` com `ready: true` e `moduleStatuses`.
6. Registra `unit_provisioning_succeeded`.

Em erro:

- Atualiza snapshot com `status: error`, `ready: false`, `lastProvisioningError`.
- Registra `unit_provisioning_failed`.

Integracao no fluxo de criacao de unidade:

- `createUnidade` (controller) chama `ensureUnitProvisioned(...)` apos salvar a unidade.

## 4) Bootstrap por modulo

Dispatcher: `dispatchModuleBootstraps(...)`.

Resolucao de modulo:

- Aceita nomes/url base e tambem ObjectId de `modulos` (resolve por `nome`/`url_base`).
- Chaves canonicas atuais: `condominio`, `clinica`, `escalas`.

Retorno do dispatcher inclui:

- `resolvedModuleKeys`, `selectedModuleKeys`, `skippedModuleKeys`, `targetOutOfScopeModuleKeys`, `executed`.

Observacao importante:

- Retry seletivo so e suportado para `condominio`, `clinica`, `escalas`.

Bootstrap de dominio da Clinica (`clinica_cadastros`):

- Mantem as mesmas 5 chaves canonicas.
- Cada cadastro pode incluir `payload` com metadados de dominio (ex.: `entity`, `displayOrder`, `primaryIdentifier`, `searchFields`).
- O contrato e aditivo e idempotente (upsert por `key`), sem quebra de compatibilidade.

Bootstrap de dominio de Escalas (`escalas_cadastros`):

- Preserva o marcador tecnico legado de compatibilidade em `__mod_escalas_bootstrap`.
- Provisiona estrutura minima real de dominio com indice unico `uk_key` em `escalas_cadastros`.
- Semeia catalogos reais de Escalas de forma idempotente (upsert por `key`).
- Cada cadastro inclui `payload` de dominio (ex.: listas de valores e metadados de modelo).

Exemplo objetivo de Escalas (formato documentado):

```json
{
  "key": "modelo_schema_escala",
  "module": "escalas",
  "label": "Modelo de Persistencia da Escala",
  "payload": {
    "schemaVersion": 2,
    "model": "nested-recursos-em-equipes",
    "features": ["grupos_turnos", "equipes", "alocacao", "desbloqueios"]
  },
  "active": true,
  "schemaVersion": 1,
  "source": "bootstrap_escalas_v1"
}
```

Exemplo objetivo de Clinica (formato documentado):

```json
{
  "key": "pacientes",
  "module": "clinica",
  "label": "Pacientes",
  "path": "/pacientes",
  "payload": {
    "entity": "paciente",
    "displayOrder": 20,
    "primaryIdentifier": "cpf",
    "searchFields": ["nome", "cpf", "telefone"]
  },
  "active": true,
  "schemaVersion": 1,
  "source": "bootstrap_clinica_v1"
}
```

## 5) `moduleStatuses` como snapshot (estado atual)

`moduleStatuses` representa o estado atual por modulo no snapshot global (`unit_provisioning_status`).

Campos relevantes por item:

- `moduleKey`
- `moduleLabel`
- `requestedModule`
- `status` (`ready`, `pending`, `error`, `unmapped`)
- `ready` (boolean)
- `reason`
- `bootstrapCollection`, `markerKey`, `indexName`
- `lastBootstrapAt`
- `source`

## 6) Trilha de auditoria (`unit_provisioning_events`) como historico

Cada evento e persistido com:

- `unidadeId`, `dbName`
- `eventType`
- `scope` (`unit` ou `module`)
- `moduleKey` (quando `scope = module`)
- `status` (`started`, `success`, `error`, `info`)
- `message`, `reason`, `operation`, `metadata`
- `snapshotVersion`, `createdAt`

Eventos emitidos no fluxo atual:

- Unidade: `unit_provisioning_started|succeeded|failed`, `unit_retry_started|succeeded|failed`.
- Modulo: `module_bootstrap_succeeded|failed|unmapped`.

## 7) Diferenca: estado atual vs historico

- Estado atual (snapshot): `unit_provisioning_status` (+ `moduleStatuses`).
  - Uso: responder situacao atual da unidade e de cada modulo.
  - Endpoint: `GET /gestor/api/unidades/:id/provisioning`.

- Historico (eventos): `unit_provisioning_events`.
  - Uso: auditoria temporal, diagnostico e trilha operacional.
  - Endpoint: `GET /gestor/api/unidades/:id/provisioning/events`.

Resumo pratico:

- Snapshot responde "como esta agora".
- Historico responde "o que aconteceu ao longo do tempo".

## 8) Retry global e retry seletivo

Endpoint unico: `POST /gestor/api/unidades/:id/provisioning/retry`.

Regra de modo:

- Sem `modulosRetry` (ou equivalente): retry global.
- Com `modulosRetry` (ou equivalente): retry seletivo.

Entradas aceitas para modulos de retry (body e query):

- `modulo`
- `moduloKey`
- `moduleKey`
- `modulosRetry`
- `modulosRetryKeys`

As entradas aceitam string unica, array ou CSV; o backend normaliza e remove duplicados.

Validacoes do retry seletivo:

- modulo invalido -> `400`.
- modulo sem suporte a retry seletivo -> `400`.
- modulo nao habilitado para a unidade -> `400`.

## 9) Endpoints e contratos atuais

### 9.1) GET `/gestor/api/unidades/:id/provisioning`

Requisitos:

- `requireLogin`.
- unidade existente.
- acesso autorizado a unidade (`ensureCanAccessUnidade`).

Resposta de sucesso (200):

```json
{
  "success": true,
  "data": {
    "unidadeId": "65f2...",
    "dbName": "wdgestor_unit_65f2...",
    "status": "ready",
    "ready": true,
    "tipo": "principal",
    "lastProvisioningError": null,
    "modulosHabilitados": ["65f2...", "65f3..."],
    "modulosHabilitadosDisplay": ["Gestao de Condominio", "Clinica"],
    "tenantBase": {
      "model": "unidade",
      "unidadeId": "65f2...",
      "dbName": "wdgestor_unit_65f2..."
    },
    "globalStatus": {
      "status": "ready",
      "ready": true,
      "lastProvisioningError": null,
      "createdAt": "2026-03-06T12:00:00.000Z",
      "updatedAt": "2026-03-06T12:00:00.000Z",
      "lastProvisionedAt": "2026-03-06T12:00:00.000Z"
    },
    "moduleStatuses": [
      {
        "moduleKey": "clinica",
        "status": "ready",
        "ready": true,
        "reason": "bootstrap_ok",
        "source": "snapshot"
      }
    ],
    "snapshotVersion": "unit-tenant-v1",
    "inspectedAt": "2026-03-06T12:05:00.000Z"
  }
}
```

### 9.2) GET `/gestor/api/unidades/:id/provisioning/events`

Contrato de leitura da trilha (usado no modal de detalhes da unidade).

Query params suportados:

- `limit`: inteiro positivo, maximo 500 (default 100).
- `scope`: `unit` ou `module`.
- `moduleKey`: string (filtro por modulo).
- `operation`: string (`ensure`, `retry_global`, `retry_selective`, etc).
- `status`: `started`, `success`, `error`, `info`.
- `before`: cursor para paginacao (`ISO` ou `ISO|eventId`).

Paginacao:

- ordenacao: `createdAt desc`, depois `_id desc`.
- resposta inclui `pagination.hasMore` e `pagination.nextBefore`.

Resposta de sucesso (200):

```json
{
  "success": true,
  "data": {
    "unidadeId": "65f2...",
    "filters": {
      "limit": 20,
      "scope": "module",
      "moduleKey": "Escalas",
      "operation": "retry_selective",
      "status": "success",
      "before": "2026-03-06T12:10:00.000Z|65f9..."
    },
    "pagination": {
      "hasMore": true,
      "nextBefore": "2026-03-06T12:01:00.000Z|65f8..."
    },
    "total": 20,
    "events": [
      {
        "eventId": "65f9...",
        "unidadeId": "65f2...",
        "dbName": "wdgestor_unit_65f2...",
        "eventType": "module_bootstrap_succeeded",
        "scope": "module",
        "moduleKey": "escalas",
        "status": "success",
        "message": "Bootstrap do modulo escalas concluido.",
        "reason": null,
        "operation": "retry_selective",
        "metadata": {
          "retryMode": "selective"
        },
        "createdAt": "2026-03-06T12:10:00.000Z"
      }
    ]
  }
}
```

Erros de validacao (`400`):

- `limit` invalido.
- `scope` invalido.
- `status` invalido.
- `before` invalido.

### 9.3) POST `/gestor/api/unidades/:id/provisioning/retry`

Requisitos:

- `requireLogin`.
- role `user` nao pode reprocessar provisioning.
- unidade existente.
- acesso autorizado a unidade.

Retry global (sem modulos):

```json
{
  "success": true,
  "data": {
    "ok": true,
    "unidadeId": "65f2...",
    "retried": true,
    "previousStatus": "error",
    "request": {
      "tipo": "principal",
      "modulosHabilitados": ["65f2...", "65f3..."]
    },
    "provisioningResult": {
      "globalStatus": "ready",
      "snapshotVersion": "unit-tenant-v1"
    },
    "snapshot": {
      "status": "ready",
      "ready": true
    }
  }
}
```

Retry seletivo (exemplo de request):

```json
{
  "modulosRetry": ["clinica", "escalas"]
}
```

Retry seletivo (campos principais de resposta):

```json
{
  "success": true,
  "data": {
    "ok": true,
    "mode": "selective",
    "request": {
      "modulosRetry": ["clinica", "escalas"],
      "modulosRetryKeys": ["clinica", "escalas"]
    },
    "snapshot": {
      "status": "ready",
      "moduleStatuses": [
        { "moduleKey": "clinica", "status": "ready" },
        { "moduleKey": "escalas", "status": "ready" }
      ]
    }
  }
}
```

## 10) Fluxo geral: criacao -> provisioning -> inspect/retry

1. `POST /gestor/api/unidades` cria unidade.
2. Backend executa `ensureUnitProvisioned(...)` para a unidade criada.
3. Estado atual fica em `unit_provisioning_status` (`moduleStatuses` incluido).
4. Eventos ficam em `unit_provisioning_events`.
5. `GET /.../provisioning` consulta snapshot atual.
6. `GET /.../provisioning/events` consulta trilha historica (com filtros/paginacao).
7. `POST /.../provisioning/retry` permite retry global ou seletivo.
8. Modal de detalhes da unidade consome status e historico e permite retry tecnico.

## 11) Escopo e limites desta documentacao

- Documento descreve comportamento implementado hoje.
- Nao cria arquitetura nova.
- Nao altera contratos de `resolveConnection`, `unitScope` ou cache/LRU.
