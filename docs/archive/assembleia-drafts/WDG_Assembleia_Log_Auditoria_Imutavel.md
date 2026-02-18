# WD Gestor — Assembleia: Log de Auditoria Imutável (Etapa D)

Data: 2026-02-18  
Escopo: módulo **Condomínios → Assembleias** (com eventos originados também pelo **Portal do Morador**)

Este documento define um **log de auditoria append-only** (imutável), com rastreabilidade ponta-a-ponta para **presença, quórum, votação, ata, anexos e ações do mediador**.

---

## 1) Objetivos (o que o log resolve)

1. **Prova de integridade**: o que aconteceu, quando, por quem, e com qual contexto (usuário, unidade, IP, user-agent, origem Portal/Gestor).
2. **Reconstituição**: reconstruir o estado da execução da assembleia com base em eventos (event sourcing parcial).
3. **Anti-fraude**: detectar alterações indevidas, duplicidades, replays e edições retroativas.
4. **Depuração**: diagnósticos de inconsistência (ex.: quórum mudou sem evento, voto contabilizado fora da janela etc).
5. **Compliance**: trilha auditável sem “buracos” para ações sensíveis.

---

## 2) Princípios (regras duras)

### 2.1 Append-only
- Eventos **nunca** são atualizados nem removidos.
- Correções ocorrem por **novo evento** (ex.: `presence.revoked` ao invés de “apagar presença”).

### 2.2 Fonte de verdade por `executionId`
- Toda execução tem um stream de eventos.
- Eventos têm ordenação por `seq` (monotônico) e `ts` (timestamp real).

### 2.3 Cadeia de integridade (hash encadeado)
- Cada evento armazena:
  - `hash` do evento atual (conteúdo canônico)
  - `prevHash` do evento anterior do mesmo `executionId`
- Permite provar adulteração de histórico.

### 2.4 Idempotência e anti-replay
- Cada evento pode carregar:
  - `idempotencyKey` (ex.: request-id, correlation-id)  
  - `dedupeKey` (assinatura de “mesmo efeito”)

---

## 3) Coleção proposta

Coleção: `cond_assembleia_audit_log`

> OBS: se quiser escalar muito, dá para particionar por mês (`cond_assembleia_audit_log_YYYY_MM`) ou usar TTL para eventos “debug” (não recomendado para eventos legais).

---

## 4) Modelo de documento (Mongo)

### 4.1 Estrutura base

```js
{
  _id: ObjectId,

  // chaves de domínio
  executionId: ObjectId,          // execução da assembleia
  assembleiaId: ObjectId,         // assembleia (convocação/config)
  unidadeId: ObjectId,            // condomínio/unidade
  condominioId: ObjectId,         // se existir separado

  // ordenação
  seq: NumberLong,                // monotônico por executionId
  ts: Date,                       // timestamp do evento
  tzOffsetMin: Number,            // opcional: offset do cliente

  // classificação
  type: String,                   // ex: "presence.confirmed", "vote.cast"
  category: String,               // ex: "presence" | "quorum" | "vote" | "ata" | "lock" | "system"
  severity: String,               // "info" | "warn" | "error" | "security"

  // origem e ator
  origin: {
    channel: String,              // "gestor" | "portal" | "system"
    route: String,                // rota HTTP (se aplicável)
    method: String,               // "GET/POST/..."
    requestId: String,            // correlation id
  },

  actor: {
    actorType: String,            // "user" | "morador" | "system"
    userId: ObjectId,             // usuário do Gestor (se aplicável)
    moradorId: ObjectId,          // morador (se aplicável)
    sessionId: String,            // id de sessão (se houver)
    ip: String,
    userAgent: String,
  },

  // payload canônico (pequeno e objetivo)
  data: Object,

  // chaves de idempotência/dedup
  idempotencyKey: String,
  dedupeKey: String,

  // integridade
  prevHash: String,
  hash: String,

  // auditoria interna
  createdAt: Date,                // redundante com ts; útil para index/monitoramento
}
```

### 4.2 Regras para `data` (payload)
- **Não** guardar blobs pesados (PDF, imagens).
- Guardar **referências**:
  - `ataId`, `anexoId`, `documentId`
- Guardar **snapshots pequenos** quando necessário:
  - `quorum.snapshot`: números agregados
  - `vote.snapshot`: hash do voto e metadados

---

## 5) Tipos de eventos (catálogo inicial)

### 5.1 Lock / Mediador
- `lock.acquired`
  - `data: { mediatorUserId, lockId, ttlSec }`
- `lock.renewed`
  - `data: { lockId, ttlSec }`
- `lock.released`
  - `data: { lockId, reason }`
- `lock.denied`
  - `data: { requestedBy, currentMediator, reason }`

### 5.2 Presença
- `presence.confirmed`
  - `data: { presenceId, pessoaId, unidadeHabitacionalId, mode, proof }`
- `presence.revoked`
  - `data: { presenceId, reason }`
- `presence.corrected`
  - `data: { presenceId, from, to, reason }` *(somente se realmente necessário)*

### 5.3 Quórum
- `quorum.recalculated`
  - `data: { presentCount, eligibleCount, percent, basis, ruleVersionHash }`
- `quorum.threshold.reached`
  - `data: { threshold, percent, basis }`

### 5.4 Pauta / Sessão
- `agenda.item.opened`
- `agenda.item.closed`
- `session.paused`
- `session.resumed`
- `session.closed`

### 5.5 Votação (Portal do Morador e/ou Gestor)
- `vote.opened`
  - `data: { votacaoId, ruleSnapshotHash, opensAt, closesAt }`
- `vote.cast`
  - `data: { votacaoId, votoId, choice, weight, unitRef, receiptHash }`
- `vote.updated` *(idealmente evitar; preferir “recast” ou “revoked+cast”)*
- `vote.revoked`
  - `data: { votacaoId, votoId, reason }`
- `vote.closed`
  - `data: { votacaoId, resultHash, totals }`

### 5.6 Ata
- `ata.draft.saved`
- `ata.generated`
- `ata.published`
- `ata.signed` *(se houver assinatura digital)*

### 5.7 Segurança / Sistema
- `auth.failed`
- `permission.denied`
- `invariant.violation`
- `system.migration.applied`

---

## 6) Índices (performance + segurança)

### 6.1 Índices obrigatórios
1. Stream por execução:
```js
db.cond_assembleia_audit_log.createIndex({ executionId: 1, seq: 1 }, { unique: true })
```

2. Busca por assembleia/unidade:
```js
db.cond_assembleia_audit_log.createIndex({ assembleiaId: 1, ts: -1 })
db.cond_assembleia_audit_log.createIndex({ unidadeId: 1, ts: -1 })
```

3. Filtro por tipo:
```js
db.cond_assembleia_audit_log.createIndex({ executionId: 1, type: 1, ts: -1 })
```

### 6.2 Idempotência (opcional, recomendado)
```js
db.cond_assembleia_audit_log.createIndex(
  { executionId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }
)
```

### 6.3 Deduplicação (opcional)
```js
db.cond_assembleia_audit_log.createIndex(
  { executionId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } }
)
```

---

## 7) Geração do `seq` com segurança (concorrência)

Opção segura (recomendada): coleção de counters por execução.

Coleção: `cond_assembleia_counters`

```js
{ _id: executionId, auditSeq: NumberLong }
```

Operação:
- `findOneAndUpdate` com `$inc: { auditSeq: 1 }` e `{ upsert: true, returnDocument: "after" }`
- usar o valor retornado como `seq` do evento.

---

## 8) Hash encadeado (como fazer)

### 8.1 Canonicalização do evento
- Construir um objeto “canônico” com campos fixos:
  - `executionId, seq, ts, type, actor, origin, data, prevHash`
- Serializar em JSON determinístico (ordem de chaves estável).
- Hash: `SHA-256` (hex).

### 8.2 Fluxo
1. Buscar o último evento do `executionId` (maior `seq`) para obter `prevHash`.
2. Gerar `seq` via counter.
3. Montar evento, calcular `hash`.
4. Inserir.

> Em caso de corrida rara (mudança no last entre passo 1 e 3), a base ainda mantém consistência por `seq` único.
> Para 100% de rigor, pode-se obter `prevHash` pelo evento `seq-1` após reservar `seq`.

---

## 9) O que é “imutável” na prática

Mesmo sem WORM storage, você reforça imutabilidade com:

1. **Bloqueio lógico no app**: não expor endpoints de update/delete.
2. **Permissões no Mongo**: usuário do app sem `update`/`remove` na coleção de audit (ideal: apenas `insert` + `find`).
3. **Monitoramento**: alertar se ocorrer `update`/`delete` (via audit do Mongo / logs).
4. **Hash chain**: detecta adulteração mesmo que alguém altere via acesso indevido.

---

## 10) Integração com o seu projeto (como plugar sem bagunça)

### 10.1 Lugar ideal do código
- `src/modules/condominios/assembleias/app/services/auditLogService.js` *(ou equivalente)*
- Expor API pequena:

```js
appendEvent({ executionId, assembleiaId, unidadeId, type, category, actor, origin, data, idempotencyKey, dedupeKey })
```

### 10.2 Onde registrar eventos
- **Pontos críticos**:
  - acquire/renew/release lock do mediador
  - presença confirmada/revogada (Portal)
  - abertura/fechamento de votação
  - voto lançado
  - geração/publicação de ata
  - mudanças de estado da execução (start/pause/close)

### 10.3 Regra de ouro
- Evento é gravado **junto** da ação:
  - idealmente na mesma transação (se estiver usando session/transactions)
  - ou com **ordem consistente** (ação e depois audit; se falhar, criar evento `invariant.violation`)

---

## 11) Plano de adoção (mínimo risco)

1. Criar coleção + índices + counter.
2. Implementar `appendEvent` e usar em **um único fluxo** (Lock do mediador).
3. Cobrir com teste (unit/integration):  
   - `lock.acquired` cria evento com `seq=1`  
   - `lock.denied` cria evento `security/warn`
4. Expandir para presença e votação.
5. Ativar hash encadeado quando a API estiver estabilizada.

---

## 12) Checklist de pronto (para você marcar)

- [ ] Coleção `cond_assembleia_audit_log` criada
- [ ] Índices `executionId+seq` (unique) e `executionId+type+ts`
- [ ] Counter `cond_assembleia_counters` com `auditSeq`
- [ ] `appendEvent` implementado e usado no Lock do mediador
- [ ] Pelo menos 1 teste automatizado de auditoria
- [ ] Hash chain gerando `prevHash/hash` (ou preparado para ativar)
- [ ] Permissão Mongo restringindo update/delete na coleção (se possível)

---

Se você quiser, eu já preparo a **Etapa E** (testes mínimos e invariantes do audit log) no mesmo padrão: quais testes criamos primeiro, onde plugar, e quais falhas detectar automaticamente.
