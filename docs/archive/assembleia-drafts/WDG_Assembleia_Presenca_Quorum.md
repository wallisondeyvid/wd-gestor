# WD Gestor — Assembleia: Modelo Formal de Presença e Quórum (Letra B)

Data: 2026-02-18  
Escopo: **módulo Gestão de Condomínios** (mediador/operação) + **Portal do Morador** (confirmação, acompanhamento e voto).  
Objetivo: definir um modelo **configurável**, **auditável** e **compatível com múltiplos regimentos** para presença e quórum.

---

## 1) Conceitos (glossário mínimo)

- **Assembleia (AG)**: evento convocado com pauta, regras e janela(s) de participação.
- **Convocação/edital**: documento que define regras e quóruns aplicáveis (por tipo de deliberação e/ou fases).
- **Unidade**: apartamento/lote (com fração ideal, se aplicável).
- **Titular(es)**: pessoas com direito de participação (proprietário, co-proprietário, procurador).
- **Representação (procuração)**: vínculo que habilita alguém a representar a unidade (ou parte dela) na AG.
- **Presença**: estado formal “participa da assembleia” para fins de quórum.
- **Quórum**: critério numérico mínimo para instalar/abrir e/ou deliberar.
- **Peso**: unidade de contagem (por cabeça, por unidade, por fração ideal, por coeficiente).
- **Janela de presença**: quando é permitido confirmar/retirar presença.

---

## 2) Premissas de segurança e governança

1. **Fonte de verdade do estado** (presença/participação): **Gestão de Condomínios**.  
   Portal do Morador envia ações (confirmar/retirar), mas o estado final é consolidado e gravado no módulo do condomínio.

2. **Auditoria imutável**: toda mudança de presença gera evento em log (ver Letra D).

3. **Determinismo**: quórum deve ser calculável a partir de:
   - lista de unidades elegíveis;
   - regras da assembleia (config);
   - eventos de presença válidos;
   - (opcional) regras de inadimplência/impedimento, se aplicarem.

4. **Configura antes de convocar**: a assembleia carrega um snapshot da configuração no momento da convocação. Mudanças futuras na “config global do condomínio” não alteram assembleias já convocadas (a não ser via retificação formal).

---

## 3) Modelo de Presença

### 3.1 Estados de presença por **Unidade** (recomendado como base)

A presença deve ser consolidada no nível **Unidade**, mesmo que múltiplas pessoas atuem por ela.

**PresenceStatus (por unidade):**
- `ABSENT` — ausência (padrão)
- `PRESENT` — presença confirmada
- `EXCUSED` — presença dispensada/justificada (opcional, geralmente não conta)
- `BLOCKED` — impedida de participar (ex.: regra de inadimplência, se configurada)
- `REVOKED` — presença revogada (procuração inválida, fraude, etc.)

**Regras:**
- Uma unidade pode ter **0..n** participantes “humanos” ligados (proprietário + procuradores), mas o **ponto de contagem** é a unidade (e seu peso).
- Se a assembleia permitir **retirada de presença**, `PRESENT -> ABSENT` é possível, mas deve ser auditado e pode ser bloqueado após certas fases (ex.: após abertura de votação).

### 3.2 Participante vs Unidade (camada humana)

Para cada presença confirmada, registrar também **quem** a confirmou e **qual título**:
- `role`: `OWNER` | `PROXY` | `MANAGER` (síndico/administradora) | `OBSERVER`
- `authMethod`: `PORTAL_LOGIN` | `PIN` | `BIOMETRIA` | `MANUAL_BY_MEDIATOR` | etc.
- `source`: `PORTAL` | `GESTOR`

> Importante: **a presença efetiva** é a unidade; o “humano” é apenas o originador/assinante do ato.

### 3.3 Fluxos de confirmação (Portal vs Gestor)

**Portal do Morador (recomendado):**
- Confirmar presença (check-in)
- Retirar presença (se permitido)
- Ver status atual e histórico resumido (não mutável)

**Gestão de Condomínios (mediador):**
- Confirmar presença manualmente (ex.: presencial com lista)
- Corrigir/invalidar presença (com motivo)
- Bloquear unidade (ex.: impedimento), se regra existir e estiver habilitada na assembleia
- Exportar lista de presentes

---

## 4) Unidades elegíveis e recortes

Antes de calcular quórum, definir o conjunto **E** de unidades elegíveis.

### 4.1 Filtros configuráveis (por assembleia)
- `considerInactiveUnits`: inclui/exclui unidades inativas
- `considerDelinquentUnits`: inclui/exclui inadimplentes (ou aplica “bloqueio”)
- `considerSuspendedRights`: unidade com direitos suspensos
- `considerVacantOrUnregistered`: caso exista status específico
- `considerFractions`: se condomínio usa fração ideal (pode afetar quórum/contagem)

> Observação: regras de voto/participação para inadimplentes variam por convenção/decisões; por isso, **tem que ser configurável**, não “hard-coded”.

### 4.2 Representação e duplicidade
- Uma unidade deve ter no máximo **1 representante ativo para votar** por pauta/fase (ver Letra A depois).
- Para presença/quórum, a unidade é presente se houver **pelo menos um participante válido** com autorização no momento do check-in.

---

## 5) Modelo de Quórum

Separar quórum em dois níveis:

### 5.1 Quórum de Instalação (abrir/instalar assembleia)
Define se a assembleia pode iniciar formalmente.

Config:
- `installation.enabled` (bool)
- `installation.rule`: 
  - `ANY_PRESENT` (pelo menos 1 unidade presente)
  - `PERCENT_UNITS` (ex.: 25% das unidades)
  - `PERCENT_FRACTION` (ex.: 25% da fração ideal total)
  - `ABSOLUTE_UNITS` (ex.: mínimo 10 unidades)
- `installation.threshold` (número)

### 5.2 Quórum de Deliberação (por item/pauta)
Define se um item pode ser votado/validado.  
**Obs:** a votação (Letra A) define aprovação; aqui é só a condição de “pode deliberar”.

Config por pauta:
- `deliberation.rule`: mesmo conjunto de regras acima
- `deliberation.threshold`
- `scope`: `ENTIRE_ASSEMBLY` | `PHASE` | `AGENDA_ITEM`

---

## 6) Unidades de contagem (Weight Units)

A presença/quórum precisa declarar **o que se conta**:

- `COUNT_BY_UNIT` — cada unidade vale 1
- `COUNT_BY_FRACTION` — soma de frações ideais (ex.: 0.0123)
- `COUNT_BY_COEFFICIENT` — peso customizado (ex.: torres, lojas, etc.)

Cada assembleia deve fixar:
- `quorum.weightUnit`: enum acima
- `weightSource`: `unit.fractionIdeal` | `unit.coefficient` | `unit=1`

---

## 7) Cálculo formal (definição matemática simples)

Defina:
- **E** = conjunto de unidades elegíveis (após filtros)
- Para cada unidade **u**, peso **w(u)**:
  - se `COUNT_BY_UNIT`: w(u)=1
  - se `COUNT_BY_FRACTION`: w(u)=fraçãoIdeal(u)
  - se `COUNT_BY_COEFFICIENT`: w(u)=coef(u)

- **P(t)** = conjunto de unidades com `PresenceStatus=PRESENT` no tempo t, e com presença válida (não revogada/bloqueada).

Então:
- **TotalWeight** = Σ_{u∈E} w(u)
- **PresentWeight(t)** = Σ_{u∈P(t)∩E} w(u)

Quórum satisfeito se:
- regra `PERCENT_*`: PresentWeight(t) / TotalWeight ≥ threshold
- regra `ABSOLUTE_UNITS`: |P(t)∩E| ≥ threshold
- regra `ANY_PRESENT`: |P(t)∩E| ≥ 1

> Guardar também “snapshots” do cálculo no momento da instalação e no início de cada pauta, para auditoria.

---

## 8) Regras de tempo (janelas e congelamento)

Config recomendada:
- `presence.openAt`
- `presence.closeAt` (opcional)
- `presence.lockAfterStart` (bool) — após iniciar a assembleia, não permite retirar/confirmar (ou só o mediador pode)
- `presence.lockAfterVotingStart` (bool) — após abrir votação, presença congela para aquela pauta

**Padrão sugerido (seguro):**
- Presença pode ser confirmada até o mediador “instalar” a assembleia.
- Após instalação, mudanças só pelo mediador (com motivo), e gerando evento auditável.

---

## 9) Casos especiais que precisamos cobrir

1. **Híbrida**: presença pode vir de:
   - check-in presencial (gestor)
   - check-in remoto (portal)
   - ambos

2. **Unidade com múltiplos proprietários**:
   - presença = unidade presente se qualquer proprietário válido confirmar
   - voto (Letra A) definirá como resolver conflitos

3. **Procuração expirada/cancelada**:
   - evento de revogação deve transicionar `PRESENT -> REVOKED` (ou invalidar participante, recalculando presença da unidade)

4. **Mudança de elegibilidade durante assembleia**:
   - regra recomendada: elegibilidade é “snapshot” na convocação (ou no início da assembleia), a menos que exista uma retificação formal.
   - exceção: revogação de procuração pode ocorrer e deve afetar presença/voto por segurança.

---

## 10) Contrato mínimo de API (alto nível)

> Isso não é o schema ainda (Letra C), é o contrato do comportamento.

- `POST /condominios/assembleias/:id/presencas/confirmar` (Portal/Gestor)
- `POST /condominios/assembleias/:id/presencas/retirar` (se permitido)
- `POST /condominios/assembleias/:id/presencas/invalidar` (somente mediador)
- `GET /condominios/assembleias/:id/presencas` (lista + pesos + status)
- `GET /condominios/assembleias/:id/quorum` (retorna TotalWeight, PresentWeight, regra, status)

Todos devem gerar evento auditável.

---

## 11) Checklist de decisões (para você aprovar)

1. **Base de presença é por Unidade** (sim/não). *(Recomendado: sim)*  
2. Presença pode ser **retirada pelo morador**? (sim/não)  
3. **Congela presença** após instalar assembleia? (sim/não)  
4. Quórum de instalação padrão: `ANY_PRESENT` ou `PERCENT_UNITS`?  
5. Quórum por pauta (deliberação) será configurável por item? (sim/não)  
6. Unidade inadimplente: **bloqueia** por padrão ou deixa configurável? *(Recomendado: configurável e “desligado” por padrão)*

---

## 12) Próximo passo seguro (depois de fechar B)

- Mapear como isso aparece na UI (Gestor + Portal): “presente/ausente/bloqueado” e o indicador do quórum.
- Só então ir para **(A) modelo formal de votação**, porque a votação depende da base de presença e elegibilidade.
