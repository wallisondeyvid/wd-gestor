# WD Gestor — Assembleia (Execução) — Próximo passo seguro (Plano técnico)

Data: 2026-02-18  
Escopo: **módulo Gestão de Condomínios** (mesa/operador) + integrações no **Portal do Morador** (presença, votos, acompanhamento, ata)

---

## 1) O que já existe no repositório (inventário rápido)

### Modelos (Mongo/Mongoose)
- `src/core/models/cond_assembleia.js` — entidade principal da assembleia (convocação, etc.)
- `src/core/models/cond_assembleia_settings.js` — **configurações/regimento** do condomínio para assembleias
- `src/core/models/cond_assembleia_execution.js` — **estado de execução** (presenças, pauta, votos, eventos, timers)

### Portal do Morador (participação)
Já existem rotas de portal relacionadas a assembleia/presença/votos em:
- `src/modules/portal-morador/app/routes/assembleias.routes.js`
- `src/modules/portal-morador/app/routes/presencas.routes.js`
- `src/modules/portal-morador/app/routes/votacoes.routes.js`

### Condomínios (mesa/execução)
Há implementação de execução no módulo condomínios:
- `src/modules/condominios/assembleias/v2/routes/execution.routes.js` (rotas/fluxo principal)
- `src/modules/condominios/assembleias/v2/services/*` (serviços da execução)
- `views/condominios/assembleias/*` + `public/js/condominios/assembleias/*` (UI/JS)

---

## 2) Riscos reais hoje (por que o próximo passo precisa ser “seguro”)

O seu requisito novo é **crítico**:
> Se o usuário A iniciar a assembleia, **apenas ele** pode operá-la. Deve impedir que outro usuário opere uma assembleia em execução. Deve haver apenas um mediador.

Isso é um **lock distribuído** (multi-usuário, multi-sessão, potencialmente multi-instância) — e é onde projetos “quebram” com mais facilidade se a gente codar direto sem padronizar.

Além disso, você definiu:
- assembleia pode ser **presencial / virtual / híbrida**
- virtual usa vídeo externo, mas **ata/votação/presença** ficam no WDG
- contagem e regras dependem do **settings** configurado e constam no **edital**
- sistema deve ser **multi-condomínio/multi-regimento** (“WDG se adapta ao condomínio”)

Tudo isso reforça que o passo mais seguro é **congelar o contrato técnico do “runtime” da execução** antes de mexer em UI/rotas.

---

## 3) Próximo passo mais seguro (o que vamos fazer agora)

### ✅ Passo 1 — Definir e documentar o “Lock do Mediador” (contrato oficial)
Sem alterar UI ainda, vamos definir:

**3.1. Quem é o mediador**
- mediador = usuário autenticado do módulo Condomínios (mesa)
- identificador mínimo: `{ userId, email }` (ou o que seu auth já expõe)

**3.2. Regras do lock**
- Uma execução (`CondAssembleiaExecution`) pode estar em:
  - `aguardando` (sem lock)
  - `aberta|em_votacao|encerrada` (com lock enquanto “ativa”)
- Lock é adquirido ao “iniciar” (ou “abrir”) a assembleia.
- Lock impede:
  - qualquer endpoint “mesa” que altere estado (pauta, abrir votação, encerrar, registrar presença manual, etc.)
  - exceto endpoints de leitura (GET status, GET pauta, GET presenças…)
- Portal **não precisa** de lock (ele opera como “participante”), mas:
  - votos/presenças devem validar **status da sessão** (ex.: só votar quando votação aberta)

**3.3. Recuperação / anti-trava**
- Se o mediador cair:
  - lock expira por **heartbeat TTL** (ex.: 60–120s sem ping)
  - outro operador pode “assumir” com ação explícita (ex.: `forceTakeover`), logada em `events`
- Tudo auditável no `events[]`

**3.4. Onde implementar**
O lugar mais estável para isso é o model de execução:
- `src/core/models/cond_assembleia_execution.js`  
Adicionar campos (proposta):
- `mediator: { userId, email, name }`
- `lock: { token, acquiredAt, lastSeenAt, expiresAt }`
- `lockVersion` (opcional, para CAS/otimista)

E no fluxo:
- middleware/guard reutilizável: `assertMediatorLock(req, execution)`  
- funções de service:
  - `acquireLock(execution, actor)`
  - `heartbeatLock(execution, token)`
  - `releaseLock(execution, token)`
  - `forceTakeover(execution, actor)`

> **Resultado esperado do Passo 1:**  
> Documento + lista exata de endpoints “mesa” que exigem lock, e como lidar com takeover.

---

### ✅ Passo 2 — Mapear “contagem e regras” (Opção C) como uma função pura
Você decidiu:
> “a contagem deve ser de acordo com o que é configurado na configuração da assembleia…”

Então o próximo passo seguro é:
- definir **uma função pura** (sem DB) que recebe:
  - `settings/regras` + `presenças confirmadas` + `ballots`
- e retorna:
  - quorum atual
  - base de cálculo (por cabeça / por fração ideal / por unidade)
  - resultado (sim/não/abstenção) + motivo (qual regra fechou)

Isso evita refactor grande depois e permite teste unitário fácil.

> **Resultado esperado do Passo 2:**  
> `computeQuorumAndOutcome()` documentado + casos de teste mínimos.

---

### ✅ Passo 3 — Checklist de paridade Portal x Mesa (contratos)
Como você tem dois front-ends (Condomínios e Portal), o seguro é congelar:
- eventos que o Portal pode fazer
- estados que o Portal pode ler
- e o que a Mesa controla

**Contrato mínimo:**
- Portal:
  - confirmar presença
  - votar
  - acompanhar andamento (somente leitura)
  - ler ata final
- Mesa:
  - iniciar/pausar/encerrar
  - controlar pauta
  - abrir/fechar votações
  - registrar presença manual e validar procurações
  - gerar/editar ata

---

## 4) Roteiro prático (ordem de execução sem se perder)

1) **Documento “Lock do Mediador” + campo no model** (pequeno patch e testes)
2) **Documento “Regras/Contagem (Opção C)” + função pura + testes**
3) **Ajustar serviços da execução** para usar lock + regra (sem mudar UI)
4) **UI Mesa**: bloquear controles para não-mediador + banner “em uso por X”
5) **Portal**: validar estados (votação aberta/fechada) + mensagens claras
6) **Ata**: gerar snapshot final + assinatura + disponibilizar no Portal

---

## 5) O que eu recomendo fazer agora (ação concreta)

Se você concorda, o **próximo deliverable** será um doc curto:

**`docs/assembleia-lock-mediador.md`**
- regra do lock (TTL, takeover, auditoria)
- tabela de endpoints “mesa” (mutating vs read-only)
- campos novos no `CondAssembleiaExecution`
- cenários: 2 operadores, mediador cai, takeover, etc.

Depois disso, a gente mexe no código com risco baixo.

