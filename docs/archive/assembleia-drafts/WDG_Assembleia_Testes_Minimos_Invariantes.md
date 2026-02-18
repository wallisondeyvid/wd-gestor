# WDG — Assembleia — Testes mínimos + Invariantes (Execução + Presença/Quórum + Votação + Auditoria)
Data: 2026-02-18

Este documento define **invariantes** (regras que nunca podem ser violadas) e uma **suíte mínima de testes** para garantir que a Execução da Assembleia seja segura de evoluir, mesmo com IA ajudando a codar.

> Objetivo: ter uma “rede de proteção” pequena, rápida e muito confiável.  
> Critério: **falhar rápido** quando algo quebra regra de negócio, segurança ou auditoria.

---

## 1) Invariantes de Segurança e Concorrência (Mediador Único)

### I-LOCK-01 — Mediador único por assembleia em execução
- Para uma assembleia `assembleiaId`, no estado `EXECUTANDO`, **deve existir no máximo 1 lock ativo**.
- Se outro usuário tentar iniciar/operar, deve receber erro explícito (409/423).

**Aceitação**
- `startExecution(A)` cria lock com `ownerUserId=A`.
- `startExecution(B)` enquanto lock ativo → **bloqueado**.
- `touch/renew(A)` mantém lock vivo.
- `touch/renew(B)` → bloqueado.

### I-LOCK-02 — Lock expira por TTL e pode ser “tomado” de forma segura
- Se `expiresAt < now`, lock é considerado inválido.
- O primeiro `startExecution` após expiração pode criar novo lock.

**Aceitação**
- Simular expiração → novo mediador consegue assumir.

### I-LOCK-03 — Operações críticas exigem lock
- Ações como **abrir votação**, **encerrar votação**, **registrar presença manual**, **publicar ata parcial**, **encerrar assembleia**:
  - exigem que `request.userId` == `lock.ownerUserId` **e** lock válido.

---

## 2) Invariantes de Presença e Quórum (B)

### I-PRES-01 — Presença é um evento, nunca “apagada”
- Uma presença não deve ser “deletada” sem rastro.
- Correções ocorrem por eventos: `PRESENCA_CONFIRMADA`, `PRESENCA_REVOGADA`, `PRESENCA_RETIFICADA`.

### I-PRES-02 — Idempotência por pessoa/unidade
- Um mesmo “participante” (morador/procurador) não pode confirmar presença duplicada para a mesma unidade/lote, no mesmo contexto.
- Se confirmar duas vezes, o sistema retorna o mesmo registro (ou 200 idempotente).

### I-PRES-03 — Somente perfis autorizados confirmam
- Portal Morador: confirma presença **somente** se possui vínculo válido (proprietário/inquilino/procurador) e regras do condomínio permitirem.
- Gestor: pode registrar/retificar manualmente (mas sempre auditado).

### I-PRES-04 — Quórum é calculado por configuração congelada
- A regra de quórum usada em execução deve ser a mesma definida na convocação/config da assembleia (congelada no “snapshot” da assembleia).
- Mudança de configuração após convocação não pode alterar a assembleia já convocada.

### I-PRES-05 — Snapshot de cálculo reproduzível
- O sistema deve conseguir recalcular o quórum do “mesmo instante” se tiver:
  - lista de presenças válidas naquele timestamp
  - config snapshot (regra)
  - base de unidades (fração ideal / peso, se aplicável)
- Isso é essencial para auditoria.

---

## 3) Invariantes de Votação (A) — “mínimo viável” agora

### I-VOTE-01 — Voto é imutável (corrigir = novo evento)
- Votos não devem ser sobrescritos “in place”.
- Correções: `VOTO_REGISTRADO` + (se necessário) `VOTO_ANULADO` + `VOTO_REEMITIDO`.

### I-VOTE-02 — Um voto válido por pauta e por unidade/participante
- Para cada `pautaId`, uma “unidade” (ou participante, conforme regra) só pode ter **1 voto ativo**.
- Se permitir troca até o encerramento: troca gera evento e invalida o anterior.

### I-VOTE-03 — Janela de votação respeitada
- Voto só é aceito entre `votacao.openedAt` e `votacao.closedAt` (ou até encerrar).
- Fora da janela → rejeitar.

---

## 4) Invariantes de Auditoria Imutável (D)

### I-AUD-01 — Todo efeito gera evento
Toda mudança relevante deve gerar ao menos 1 evento em `audit_log`:
- Lock adquirido/liberado
- Presença confirmada/retificada/revogada
- Votação aberta/fechada
- Voto registrado/anulado
- Encerramento de assembleia
- Geração/publicação de ata

### I-AUD-02 — Cadeia hash (tamper-evident)
- Cada evento tem `hash` calculado a partir de:
  - `prevHash`
  - `timestamp`
  - `eventType`
  - `payload` canonizado
- Se alguém mexer em um evento, a cadeia quebra.

### I-AUD-03 — Ordem total por assembleia
- Eventos de uma assembleia têm sequência `seq` estritamente crescente (sem buracos).
- Escrita concorrente deve usar `findOneAndUpdate`/`$inc` ou transação para garantir seq.

### I-AUD-04 — Quem fez o quê, de onde, e com qual permissão
- `actor.userId`, `actor.role`, `source` (gestor/portal), `ip`, `userAgent` quando disponível.
- Evento sem `actor` só se for evento “do sistema” (ex.: job), com `actor.type=system`.

---

## 5) Suíte mínima de testes (prioridade alta)

### Grupo T1 — Lock/Mediador
1. **T-LOCK-START-OK**: A inicia execução → lock criado
2. **T-LOCK-START-CONFLICT**: B tenta iniciar → 409/423
3. **T-LOCK-EXPIRE-TAKEOVER**: expira → B consegue iniciar
4. **T-LOCK-REQUIRED**: abrir votação sem lock → 403/409
5. **T-LOCK-OWNER**: B tenta encerrar votação com lock do A → 403/409

### Grupo T2 — Presença/Quórum
6. **T-PRES-IDEMPOTENT**: confirmar presença duas vezes → 1 presença ativa
7. **T-PRES-ROLE**: usuário sem vínculo tenta confirmar → 403
8. **T-QUORUM-SNAPSHOT**: quórum calculado usa config snapshot da convocação
9. **T-QUORUM-REPRO**: reprocessar em timestamp fixo → mesmo resultado

### Grupo T3 — Votação
10. **T-VOTE-WINDOW**: voto fora da janela → rejeitar
11. **T-VOTE-UNIQUE**: duplicar voto para mesma pauta/unidade → idempotente ou erro
12. **T-VOTE-CHANGE** (se habilitado): troca de voto antes de fechar → evento anula + novo

### Grupo T4 — Auditoria
13. **T-AUD-EMIT**: presença confirmada gera evento auditável
14. **T-AUD-HASH-CHAIN**: 3 eventos → cadeia valida; adulterar 1 → quebra
15. **T-AUD-SEQ**: concorrência (2 writes) não duplica seq

> **Meta de tempo**: esses 15 testes devem rodar em menos de ~30s com Mongo em memória, como você já está usando (`MONGO_MEMORY=1`).

---

## 6) Sugestão de estrutura dos testes no WD Gestor

### Arquivos sugeridos
- `tests/assembleia.lock.test.js`
- `tests/assembleia.presenca-quorum.test.js`
- `tests/assembleia.votacao.test.js`
- `tests/assembleia.audit-log.test.js`

### Helpers sugeridos
- `tests/helpers/createTestServer.js` (reutiliza seu padrão de createServer + skipDb/skipAuth quando aplicável)
- `tests/helpers/factoryAssembleia.js` (cria assembleia com config snapshot)
- `tests/helpers/assertAuditChain.js` (valida cadeia hash)

---

## 7) Critérios de “pronto para codar” (Definition of Ready)

Antes de começar a implementar Execução de fato, precisamos ter:
- Lock store definido (Mongo collection com TTL ou Redis) e invariantes I-LOCK cobertos por T1.
- Modelo de presença básico (event sourcing mínimo) com T2(6,7) passando.
- Audit log com cadeia hash com T4(14) passando.

---

## 8) Próximo passo recomendado (mais seguro)

1) Implementar **Lock** + **AuditLog** primeiro (T1 + T4).
2) Depois, presença idempotente (T2: 6,7).
3) Só então abrir votação.

Isso evita “construir em areia”: execução sem lock/audit vira impossível de corrigir depois.

