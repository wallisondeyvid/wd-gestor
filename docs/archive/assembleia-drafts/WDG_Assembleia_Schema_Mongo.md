# WD Gestor — Assembleia (Execução) — Schema MongoDB (C)

> Objetivo desta etapa: **materializar um schema “de verdade” no Mongo** para suportar Execução de Assembleia com segurança (multi-condomínio), **sem perder flexibilidade** para diferentes regimentos.
>
> Base real auditada no ZIP: já existem modelos em `src/core/models/`:
> - `cond_assembleia.js` (entidade “convocação”)
> - `cond_assembleia_settings.js` (regras por condomínio/unidade)
> - `cond_assembleia_execution.js` (execução em andamento + presença + votos)

---

## 0) Princípios de desenho (os “porquês”)

1. **Tenant-first**: toda query deve filtrar por `unidade_id` (ou `condominio_id` se existir). Isso evita vazamento entre condomínios.
2. **Separar Convocação (planejamento) de Execução (runtime)**: execução é “estado mutável + auditorável”. Convocação é “contrato/edital”.
3. **Regra vem da Config (Settings) e é congelada na Convocação**: nada de mudar regra “no meio” da assembleia.
4. **Imutabilidade parcial**: dados de auditoria/eventos devem ser append-only (etapa D). No schema de execução, a parte mutável é o “estado atual”.
5. **Um mediador por execução**: lock com TTL/heartbeat + gravação no documento para rastreabilidade.

---

## 1) Coleções e responsabilidades

### 1.1 `cond_assembleias` (Convocação / Edital)
Arquivo atual: `src/core/models/cond_assembleia.js`

**Propósito**: representa a assembleia “convocada” (planejada), com datas, tipo (presencial/virtual/híbrida), pauta, anexos, regras congeladas e status.

**Campos essenciais (já existem + ajustes sugeridos)**
- `unidade_id` *(ObjectId, index)* — tenant
- `titulo`, `tipo`, `data_inicio`, `data_fim`
- `status` *(String index)* — ex.: `rascunho | convocada | em_execucao | encerrada | cancelada`
- `pauta[]` — itens, ordem
- `edital` — pdf/link/metadata
- `regras_snapshot` *(Mixed)* — **cópia imutável** das regras relevantes no momento da convocação
- `schemaVersion` *(Number)*

**Índices recomendados**
- `{ unidade_id: 1, status: 1, data_inicio: -1 }`
- `{ unidade_id: 1, _id: 1 }` (já implícito, mas reforça padrão)

**Invariantes**
- Após `status >= convocada`, `regras_snapshot` não muda.
- Apenas **uma execução ativa** por assembleia (garantia no `cond_assembleia_executions`).

---

### 1.2 `cond_assembleia_settings` (Configuração por Condomínio)
Arquivo atual: `src/core/models/cond_assembleia_settings.js`

**Propósito**: guardar a configuração “flexível” do condomínio: quóruns, presença, voto, pesos, maiorias, prazos, etc.

**Campos atuais**
- `unidade_id` *(unique)*
- `regras: Mixed`
- `schemaVersion`

**Ajustes sugeridos (sem quebrar compatibilidade)**
- Manter `regras` como `Mixed`, mas **padronizar sub-árvores**:
  - `regras.presencaQuorum.*`
  - `regras.votacao.*`
  - `regras.operacao.*` (lock mediador, auditoria)

**Índices**
- Já possui unique `{ unidade_id: 1 }` ✅

**Invariantes**
- Settings pode mudar com o tempo, mas **convocações congelam snapshot**.

---

### 1.3 `cond_assembleia_executions` (Execução / Runtime)
Arquivo atual: `src/core/models/cond_assembleia_execution.js`

**Propósito**: estado de execução (mediador, fase, presença, votos, eventos de UI/andamento, ata parcial) com segurança e rastreabilidade.

#### 1.3.1 Campos que já existem (do arquivo atual)
- `unidade_id` *(ObjectId index)*
- `assembleia_id` *(ObjectId index)*
- `status` *(String index)*
- `startedBy`, `startedAt`, `endedAt`
- `pautaCursor`, `fase` (dependendo do arquivo)
- `presencas[]` (subdocs)
- `votacoes[]` (subdocs)
- `eventos[]` (subdocs)
- `schemaVersion`

#### 1.3.2 Campos novos recomendados (additivos e seguros)

**A) Lock do mediador (runtime, com TTL/heartbeat)**
- `mediador: { userId, nome, sessionId, acquiredAt, lastHeartbeatAt }`
- `lock: { token, acquiredAt, renewAt, expiresAt }`

> Motivo: garantir “apenas um operador” e permitir recuperação se o navegador cair.

**B) Snapshot de regras na execução (opcional, mas útil)**
- `regras_snapshot` *(Mixed)* — pode ser redundante com a assembleia, mas acelera execução.

**C) Quórum calculado e congelado por fase**
- `quorum: { 
  base: { criterio, totalElegiveis, totalPesoElegivel },
  atual: { presentes, presentesPeso, atingiu },
  porFase: [{ fase, presentes, presentesPeso, atingiu, at }]
}`

**D) Flags de integridade**
- `integridade: { contratoVersao, hashPauta, hashRegras }` *(strings)*

#### 1.3.3 Índices recomendados
- `{ unidade_id: 1, assembleia_id: 1 }`
- `{ unidade_id: 1, status: 1, startedAt: -1 }`
- **Garantia de execução única ativa**:
  - índice parcial único: `{ assembleia_id: 1 }` com filtro `status in ['running','paused']` (ou equivalente)

> Em Mongo/Mongoose: índice parcial é viável e é o jeito mais seguro de impedir “duas execuções ativas”.

#### 1.3.4 Invariantes importantes
- Se `status == running`, deve existir `mediador` e `lock.expiresAt` válido.
- Alterações críticas (ex.: trocar mediador) devem gerar evento de auditoria (etapa D).

---

## 2) Subschemas: Presença e Quórum (B) → como vira dado

### 2.1 `presencas[]` (subdocumento dentro da execução)
Estrutura recomendada (compatível com evolução):
- `presenceId` *(ObjectId/string)*
- `moradorId` *(ObjectId)*
- `unidadeHabitacionalId` *(ObjectId)*
- `representacao: { tipo: 'titular'|'procurador'|'conjuge'|..., documentoRef }`
- `canal: 'presencial'|'portal'|'importado'`
- `status: 'confirmado'|'pendente'|'removido'`
- `confirmadoAt`, `confirmadoBy` *(portal ou gestor)*
- `peso: { tipo: 'fracaoIdeal'|'umPorUnidade'|'custom', valor }` *(para votações ponderadas)*

**Regras de cálculo** (resumo)
- Quórum usa `presencas` filtrando `status='confirmado'`.
- Se híbrida: canal não muda cálculo, só rastreia origem.

### 2.2 Origem Portal vs Gestor
- Portal do Morador executa:
  - confirmação de presença
  - votação
  - acompanhamento/ata
- Gestor executa:
  - criação/convocação
  - início/pausa/encerramento
  - condução (pauta, encaminhamentos)

**No schema**: `confirmadoBy` e `canal` dão trilha clara.

---

## 3) Votações (A já foi documentado, aqui é o reflexo no schema)

Recomendação: manter em `votacoes[]` na execução, mas com padrão:
- `pautaItemId`
- `tipo` (simples/fracaoIdeal/qualificada/ponderado)
- `abertaAt`, `fechadaAt`
- `opcoes[]` (Sim/Não/Abstenção ou múltipla)
- `votos[]`: cada voto com `moradorId`, `unidadeHabitacionalId`, `valor`, `pesoAplicado`, `canal`, `at`.
- `resultado: { 
  totais: { porOpcao, porOpcaoPeso },
  aprovado, criterio, margem
}`

---

## 4) Migração segura: passos mínimos no código (sem “big bang”)

> A ordem abaixo é a forma mais segura de avançar (mudanças **aditivas** primeiro).

1. **Adicionar campos e índices additivos** no `cond_assembleia_execution` (lock/mediador/quorum/regras_snapshot).
2. Implementar **aquisição/renovação de lock** no início da execução (mediador):
   - `findOneAndUpdate` com condição `status != running OR lock.expiresAt < now`.
3. Criar rotina de **heartbeat** (manual/endpoint) atualizando `lock.expiresAt`.
4. Ajustar endpoints do Portal para escrever presença/votos com `canal='portal'`.
5. Criar testes de contrato mínimos:
   - “não permite 2 mediadores”
   - “quórum calculado respeita regra congelada”

---

## 5) Checklist de validação (antes de codar pesado)

- [ ] Existe **uma** execution ativa por assembleia (índice parcial + teste).
- [ ] Lock expira e permite retomada (simular queda de navegador).
- [ ] Presença do Portal não permite duplicidade (unique por `moradorId+unidadeHabitacionalId` dentro do array ou normalização via map).
- [ ] Mudança de settings não afeta assembleia convocada (snapshot).
- [ ] Todas as queries filtram por `unidade_id`.

---

## 6) Próximo passo (D)

Com schema estabilizado, o próximo passo mais seguro é modelar **Log de Auditoria imutável**:
- eventos append-only (quem fez, quando, de onde, qual payload)
- hash encadeado opcional para “tamper-evident”

