# WD Gestor — Assembleia: Lock de Mediador (Documento Técnico)

Versão: 1.0  
Data: 2026-02-18  
Escopo: **Módulo Gestão de Condomínios** (Gestor) + impactos no **Portal do Morador** (apenas leitura/participação)

---

## 1) Objetivo

Garantir que **uma Assembleia em execução tenha exatamente 1 mediador ativo** (operador), impedindo que outro usuário opere a mesma execução simultaneamente.

- A Assembleia pode ser **Presencial, Virtual ou Híbrida**.
- Mesmo na Virtual (vídeo externo), **o estado oficial** (presença, pauta, votações, ata) é controlado pelo WD Gestor.
- Moradores interagem via Portal (confirmar presença, votar, acompanhar andamento, acessar ata), mas **não podem virar mediador**.

---

## 2) Premissas e Invariantes

### Invariantes (não-negociáveis)
1. **Exclusividade**: no máximo 1 mediador por `assembleiaExecucaoId` (ou por `assembleiaId` enquanto em execução).
2. **Autoridade**: somente o mediador pode executar ações de controle (abrir, avançar pauta, abrir/fechar votação, encerrar).
3. **Resiliência**: se o mediador “cair” (fechou aba, caiu rede), o lock deve **expirar** e permitir tomada por outro operador autorizado.
4. **Auditabilidade**: mudanças de mediador e eventos críticos devem gerar **auditoria**.
5. **Multi-tenant sério**: lock deve ser isolado por `condominioId` (ou tenant) e não deve permitir colisão entre condomínios.

---

## 3) Modelo de Estado da Execução

### Estados mínimos sugeridos
- `DRAFT` (configurada, ainda não convocada)
- `CONVOCADA` (edital gerado/publicado)
- `PRONTA_PARA_EXECUCAO` (janela de presença aberta/limites definidos)
- `EM_EXECUCAO`
- `ENCERRADA`
- `CANCELADA`

O lock só é necessário para:
- `EM_EXECUCAO` (principal)
- opcionalmente `PRONTA_PARA_EXECUCAO` (se você quiser reservar o operador antes de iniciar)

---

## 4) Estratégia de Lock (Caminho A: lock persistente com TTL)

### Por que lock persistente (DB) e não lock em memória?
- Você pode ter **várias instâncias** do servidor (SaaS, escalabilidade).
- Reinício de processo não pode “liberar” assembleias incorretamente.
- TTL permite recuperação automática.

### Requisitos técnicos
- **MongoDB**: usar coleção dedicada com índice único e TTL.
- Operação atômica: `findOneAndUpdate` com `upsert` + condição de expiração.

---

## 5) Esquema de Dados

### Coleção: `assembleia_locks`

Documento por execução:

```json
{
  "_id": "condominioId:assembleiaExecucaoId",
  "condominioId": "000...010",
  "assembleiaExecucaoId": "6996...",
  "heldByUserId": "user123",
  "heldBySessionId": "wdg.sid hash/uuid",
  "heldByDeviceId": "optional-device-fingerprint",
  "heldByName": "Deyvid",
  "acquiredAt": "2026-02-18T12:00:00Z",
  "lastHeartbeatAt": "2026-02-18T12:00:15Z",
  "expiresAt": "2026-02-18T12:01:00Z",
  "version": 1
}
```

### Índices
- **Unique** em `_id` (já é unique)
- TTL em `expiresAt` (expireAfterSeconds: 0)

> TTL do Mongo não é instantâneo (pode demorar ~60s). Por isso o **código deve respeitar `expiresAt`** na lógica de aquisição e takeover, não depender só do coletor TTL.

---

## 6) Aquisição e Renovação (Heartbeat)

### Parâmetros
- `LOCK_TTL_SECONDS`: 60s (sugestão)
- `HEARTBEAT_EVERY_SECONDS`: 15s (sugestão)

### Aquisição (pseudocódigo)
Critério: pode adquirir se:
- não existe lock **OU**
- lock existe mas `expiresAt <= now` (**expirado**) **OU**
- lock é do mesmo usuário/sessão (reentrante)

Operação atômica (Mongo):

- Query:
  - `_id = key`
  - AND ( `expiresAt <= now` OR `heldBySessionId == mySessionId` )

- Update:
  - set `heldBy*`, `acquiredAt` (se takeover), `lastHeartbeatAt`, `expiresAt = now + TTL`

- Options:
  - `upsert: true`
  - retornar documento atualizado

Se a operação não retornar doc (não casou query), **falha**: lock é de outro mediador e ainda válido.

### Heartbeat
Somente o holder renova:

- Query: `_id = key` AND `heldBySessionId == mySessionId`
- Update: `lastHeartbeatAt = now`, `expiresAt = now + TTL`

Se falhar, UI deve:
- travar controles
- mostrar “perdeu controle / outro mediador assumiu”

---

## 7) Tomada de Controle (Takeover)

### Quando permitido
- lock expirado (`expiresAt <= now`)
- mediador atual não renova
- usuário tem permissão (perfil/role)

### Regra
- takeover é apenas a aquisição normal com condição de expiração.
- registrar auditoria: `LOCK_TAKEOVER`

---

## 8) Liberação do Lock

### Liberação voluntária (quando mediador encerra ou sai)
- Endpoint explícito: `DELETE /condominios/assembleias/:execId/lock`
- Query: `_id = key` AND `heldBySessionId == mySessionId`
- Delete: remove doc do lock (opcional) **ou** set expiresAt = now (expira imediatamente)

### Fechamento “não confiável”
Não confie em `beforeunload` do browser. Use, mas não dependa.

---

## 9) Endpoints (contrato mínimo)

### Gestor (operador)
- `POST /condominios/assembleias/:execId/lock/acquire`
  - body opcional: `{ deviceId }`
  - retorno:
    - 200 + lock info (ok)
    - 409 (locked) + info do holder parcial (nome, acquiredAt, expiresAt)

- `POST /condominios/assembleias/:execId/lock/heartbeat`
  - retorno:
    - 200 (ok)
    - 409/403 (perdeu lock)

- `DELETE /condominios/assembleias/:execId/lock`
  - retorno:
    - 200 (released)
    - 204 (já não era holder)

### Portal do Morador
- **Nenhum endpoint de lock**.
- Portal apenas consome o estado da assembleia e votações/presença.

---

## 10) Regras de Permissão

Sugestão (ajuste ao seu modelo):
- Pode ser mediador:
  - Administrador / Síndico / subsíndico / operador autorizado
- Não pode:
  - Morador comum (via Portal)
  - Usuários sem vínculo/escopo do condomínio

Validação obrigatória:
- `condominioId` do usuário deve bater com a assembleia
- o mediador deve ter acesso ao módulo “gestão de condomínios”

---

## 11) UX / Comportamento de Tela

### Gestor
- Ao abrir “Execução da Assembleia”:
  1. chama `acquire`
  2. se 200: habilita controles e inicia heartbeat
  3. se 409: mostra “Assembleia sendo operada por Fulano”, com:
     - status (válido até X)
     - botão “Tentar assumir” (disabled até expirar) ou “Forçar takeover” (se sua governança permitir)

- Se heartbeat falhar:
  - desabilitar botões de controle imediatamente
  - aviso em destaque: “Você perdeu o controle. Recarregue ou tente adquirir novamente.”

### Portal
- Sempre “read-only” do mediador:
  - votações e presença seguem regras do edital/config
  - andamento (pauta atual) é transmitido via polling ou SSE/websocket futuramente (não obrigatório agora)

---

## 12) Auditoria (mínimo recomendado)

Coleção: `assembleia_audit`

Eventos:
- `LOCK_ACQUIRED`
- `LOCK_HEARTBEAT` (opcional, pode ser ruidoso)
- `LOCK_RELEASED`
- `LOCK_TAKEOVER`
- `EXEC_STARTED`
- `AGENDA_ADVANCED`
- `VOTE_OPENED`
- `VOTE_CLOSED`
- `EXEC_FINISHED`

Campos:
- `condominioId`, `execId`, `actorUserId`, `type`, `ts`, `meta`

---

## 13) Testes (mínimos e seguros)

### Unit/Integration (node --test)
1. **Exclusividade**
   - userA adquire -> 200
   - userB tenta -> 409
2. **Expiração**
   - userA adquire TTL curto
   - aguarda expirar
   - userB adquire -> 200
3. **Heartbeat renova**
   - userA adquire
   - heartbeat -> 200 e estende expiresAt
4. **Perda de lock**
   - userA adquire
   - simula takeover por userB após expiração
   - heartbeat de userA -> falha

---

## 14) Migração / Introdução no Código (patch mínimo)

Ordem mais segura:
1. Criar `assembleiaLocks` (DAO/service) isolado
2. Criar endpoints `/lock/*` somente para Gestor
3. Integrar tela Execução: acquire + heartbeat
4. Guardar mediador também na execução (somente leitura)
5. Adicionar auditoria

---

## 15) Decisões em aberto (para fechar antes de codar)

- Takeover: **permitido automaticamente após expirar**, ou exige permissão extra?
- TTL/heartbeat: 60s/15s ok?
- Identificador do lock: usar `assembleiaExecucaoId` ou `assembleiaId` + `status`?
- Em assembleia híbrida/virtual:
  - mediador controla “quórum/presença” por confirmações do Portal e do check-in presencial (se houver)
- Política de “pausa” da assembleia:
  - mediador pode “pausar” e manter lock?
  - lock expira mesmo pausado? (recomendado manter heartbeat)

---

## 16) Resultado esperado

Com este lock:
- Você elimina conflito operacional (dois usuários clicando em “abrir votação” ao mesmo tempo).
- Mantém governança flexível por condomínio (configurações no edital).
- Fica mais próximo de SaaS-ready (multi-instância + comportamento previsível).

---
