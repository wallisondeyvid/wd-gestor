# WD Gestor — Assembleia: Próximo Passo (Implementação Segura)
Data: 2026-02-18

Este documento é o “roteiro executável” após **Testes mínimos + Invariantes**. A meta é **entregar valor com risco mínimo**, mantendo paridade e rastreabilidade.

---

## Objetivo do próximo passo
Implementar **Lock do Mediador** + **Log de Auditoria imutável (cadeia hash)**, com **testes mínimos** garantindo:

- Só existe **1 mediador ativo** por execução (assembleia em andamento).
- Operações críticas exigem **token/lock válido**.
- Todo evento crítico gera **AuditEvent** imutável e verificável.
- A execução é **recuperável** após crash/restart sem perder integridade.

> Por quê começar por aqui?
> Porque isso “blinda” o resto: presença, quórum e votação ficam naturalmente mais seguros quando operam sobre um núcleo com *single-writer* e trilha de auditoria.

---

## Entrega 1 — Lock do Mediador (núcleo)
### 1.1 Modelo (Mongo)
Coleção sugerida: `assembleia_execution_locks`

Campos (mínimo):
- `assembleiaId` (ObjectId / string)
- `status`: `"ACTIVE" | "RELEASED" | "EXPIRED"`
- `ownerUserId`
- `ownerSessionId` (ou `ownerTokenId`)
- `acquiredAt` (Date)
- `expiresAt` (Date)
- `releasedAt` (Date, opcional)
- `lockVersion` (number) — para CAS/optimistic concurrency
- `metadata`: `{ ip, userAgent }` (opcional)

Índices:
- **unique** em `{ assembleiaId: 1, status: 1 }` com partial filter `{ status: "ACTIVE" }`
  - garante 1 lock ativo por assembleia.
- TTL opcional em `expiresAt` (se você preferir expirar automaticamente; senão expira logicamente).

### 1.2 Fluxos
**Acquire lock** (quando o mediador inicia execução):
- Se não existe lock ACTIVE → cria lock.
- Se existe lock ACTIVE:
  - se `owner == requester` → renova/retorna lock.
  - senão → bloqueia com erro 409 “already locked” e retorna “owner/desde quando”.

**Renew lock** (heartbeat):
- PATCH/POST de renovação estende `expiresAt`.
- Protege contra lock “morto” por queda de conexão.

**Release lock** (encerrar execução):
- Marca RELEASED e registra `releasedAt`.

**Takeover (opcional, admin)**
- Somente perfil “admin” ou “síndico” com justificativa.
- Escreve evento no audit log “LOCK_TAKEOVER”.

### 1.3 Contrato HTTP sugerido (Gestão de Condomínios)
Base: `/condominios/administracao/assembleias/execution/:id`

- `POST /lock/acquire`
- `POST /lock/renew`
- `POST /lock/release`
- `GET  /lock/status`

Retornos:
- 200: lock ok (token + expiresAt)
- 409: lock já está com outro usuário (owner, acquiredAt)
- 403: sem permissão para takeover/forçar
- 404: assembleia não existe

### 1.4 Token de lock
Sugestão simples e segura:
- gere `lockToken` (random 32 bytes base64url) no acquire
- guarde **hash** do token no lock (não o token puro)
- cliente envia `X-Assembly-Lock: <token>`
- server compara `sha256(token)` com o hash armazenado

---

## Entrega 2 — Audit Log imutável (cadeia hash)
### 2.1 Modelo (Mongo)
Coleção: `assembleia_audit_events`

Campos (mínimo):
- `_id`
- `assembleiaId`
- `executionId` (opcional)
- `seq` (number incremental por assembleia)
- `type` (string): `"LOCK_ACQUIRED" | "LOCK_RENEWED" | "PRESENCE_CONFIRMED" | ...`
- `actor`: `{ userId, role, origin: "gestor" | "portal-morador" }`
- `payload` (objeto pequeno e estável)
- `createdAt`
- `prevHash` (string)
- `hash` (string)

Regras:
- `hash = sha256(prevHash + canonicalJson(eventSemHash))`
- `prevHash` do primeiro evento pode ser `"GENESIS"`.

Índices:
- `{ assembleiaId: 1, seq: 1 }` unique
- `{ assembleiaId: 1, createdAt: 1 }`

### 2.2 Canonical JSON
Para manter hash estável:
- ordenar chaves (stringify determinístico)
- remover campos variáveis (`hash`, `_id`) do corpo do hash
- padronizar datas (ISO)

### 2.3 Verificação
Endpoint interno (admin/dev):
- `GET /audit/verify`
  - percorre eventos por `seq` e valida cadeia
  - retorna ok/erro + onde quebrou

---

## Testes mínimos (para esta etapa)
> Estes são “smoke tests” que garantem o **núcleo** antes de ampliar.

### T1 — Acquire lock (ok)
- cria assembleia de teste (ou usa fixture)
- chama `/lock/acquire` como usuário A
- espera 200 + token + expiresAt

### T2 — Acquire lock (conflito)
- usuário A adquire
- usuário B tenta adquirir
- espera 409 + ownerUserId

### T3 — Renew lock (ok)
- usuário A com token renova
- `expiresAt` aumenta
- evento `LOCK_RENEWED` existe no audit log

### T4 — Operação protegida exige lock
- tenta `POST /votacoes/...` (ou rota placeholder) sem header do lock
- espera 409/423/401 (definir padrão)
- com lock → passa

### T5 — Audit log cadeia íntegra
- gera 3 eventos (acquire, renew, release)
- roda `verify` e retorna OK

### T6 — Imutabilidade (tentativa de update)
- tenta atualizar evento (se houver função interna) → proibido
- ou, pelo menos, não existe código path de update/delete

---

## Invariantes que viram “asserts” no código
- **INV-LOCK-001**: no máximo 1 lock ACTIVE por assembleia
- **INV-LOCK-002**: toda ação de mediador exige lock válido
- **INV-AUDIT-001**: todo evento tem `prevHash` coerente
- **INV-AUDIT-002**: `seq` é estritamente crescente por assembleia
- **INV-AUDIT-003**: não existe update/delete em AuditEvent

---

## Onde mexer no código (mapa prático)
1) **Models**
- `src/core/models/AssembleiaExecutionLock.js` (novo)
- `src/core/models/AssembleiaAuditEvent.js` (novo)

2) **Services**
- `src/modules/condominios/assembleias/services/lockService.js` (novo)
- `src/modules/condominios/assembleias/services/auditService.js` (novo)

3) **Middleware**
- `requireAssemblyLock(req,res,next)` (novo)
  - usado em rotas críticas de execução

4) **Routes**
- `execution.routes.js` (ou v2 equivalente)
  - adiciona endpoints de lock e audit verify (admin)

5) **Tests**
- `tests/assembleia.lock.test.js` (novo)
- `tests/assembleia.audit.test.js` (novo)

---

## Checklist de aceitação (Definition of Done)
- [ ] Lock + token funcionando (A consegue, B não consegue)
- [ ] Renew/Release funcionam
- [ ] Audit events são gerados para lock
- [ ] Verify cadeia hash passa
- [ ] Testes T1–T6 verdes
- [ ] Sem handles vazando (watchdog ok)
- [ ] Sem imports relativos proibidos (verify:imports ok)

---

## Próximo passo depois disso
Com o núcleo pronto:
1) **Presença** (Portal Morador confirma presença → gera evento `PRESENCE_CONFIRMED`)
2) **Quórum** (derivado, nunca “digitado”)
3) **Votação** (só com lock + audit)

