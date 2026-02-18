# WD Gestor — Assembleia: Modelo Formal de Votação (A)

**Versão:** 0.1 (draft operacional)  
**Data:** 2026-02-18  
**Escopo:** módulo **Condomínios** (fonte de verdade) + integrações do **Portal do Morador** (participação, voto, acompanhamento).

Este documento depende do **Modelo de Presença e Quórum (B)** e assume:
- existe um **mediador único** com lock de execução;
- existe conceito de **participante elegível** (presença válida) e de **peso** (por fração ideal / por unidade / por pessoa) conforme configuração.

---

## 1) Objetivo

Padronizar, de forma **configurável por condomínio**, como o WD Gestor calcula:
- **quem pode votar** (e quando);
- **como o voto é contado** (peso e regra de aprovação);
- **como tratar conflitos** (duplicidade, mudança de voto, procuração, múltiplos titulares, inadimplência, etc.);
- **como auditar** (registro imutável e rastreável).

O sistema deve se adaptar ao **regimento interno** do condomínio — não o contrário.

---

## 2) Conceitos e entidades

### 2.1 Pauta / Item de votação
Uma assembleia possui N itens. Cada item define:
- `tipo`: eleição / deliberação / aprovação de ata / prestação de contas / etc.
- `regra_aprovacao` (ver seção 4)
- `peso_voto` (ver seção 3)
- `janela_votacao` (abertura/fechamento)
- `visibilidade` (quem vê resultado parcial, etc.)

### 2.2 Eleitor elegível
Um eleitor elegível é uma **presença válida** (modelo B) + regras adicionais:
- vínculo com unidade/condomínio;
- categoria (proprietário, representante, inquilino, visitante) conforme regimento;
- restrições (inadimplência, suspensão, conflito de interesse) quando configuradas.

> No Portal, a pessoa “executa o voto”. No Condomínios, o sistema valida e persiste.

---

## 3) Modelo de peso do voto (weight model)

O peso define “quanto” cada voto vale para **cada item**.

### 3.1 Tipos suportados (configuráveis)
1) **Por pessoa (1 voto = 1)**
   - cada eleitor elegível tem peso 1.
2) **Por unidade (1 unidade = 1)**
   - a unidade vota. Se mais de um eleitor tentar votar pela mesma unidade, aplica-se política (3.3).
3) **Por fração ideal**
   - peso = fração ideal da unidade (ou somatório das frações das unidades representadas).
4) **Ponderado customizado**
   - peso derivado de regra configurável (ex.: lojas valem 2x, torre A vale 1.2x, etc.) — **opcional** e deve ser explicitamente habilitado.

### 3.2 Origem do peso
- `unidade.fracaoIdeal` (fonte principal)
- `unidade.pesoCustom` (se habilitado)
- fallback (se fração não existir): 1 por unidade

### 3.3 Política de múltiplos representantes por unidade
Configuração por condomínio/item:
- **Único voto por unidade** (recomendado):
  - primeira submissão “trava” a unidade;
  - ou “último voto vence” até o fechamento;
  - ou “mediador escolhe” (manual) em caso de conflito.
- **Votos múltiplos por unidade** (raro):
  - só se o regimento permitir (ex.: co-proprietários com frações internas).
  - exige modelagem adicional de “sub-fração” por eleitor.

> **Padrão seguro sugerido:** “**último voto vence** até o fechamento” + auditoria completa (troca de voto registrada).

### 3.4 Procuração
Quando habilitado:
- eleitor pode votar **representando** outro (unidade/pessoa).
- exige validação de procuração (documento e vigência) e regra de limites:
  - máximo X procurações por pessoa;
  - procuração não pode conflitar com presença do outorgante (se presente, prevalece?).

---

## 4) Regras de aprovação (approval rules)

Cada item possui uma regra. O cálculo sempre usa:
- **universo** (base): presentes válidos, ou total do condomínio, ou presentes com direito a voto.
- **medida** (métrica): contagem simples, fração ideal, unidades, etc.
- **limiar** (threshold): maioria simples, absoluta, qualificada, unanimidade, etc.

### 4.1 Tipos de universo (base)
1) **Dos presentes com direito a voto** (mais comum)
2) **Do total de unidades do condomínio** (ex.: alteração de convenção)
3) **Do total de fração ideal do condomínio** (ex.: quórum qualificado por fração)

### 4.2 Tipos de limiar (threshold)
- **Maioria simples:** `SIM > NÃO` (ignora abstenções)
- **Maioria absoluta:** `SIM >= 50% + 1` do universo (com peso)
- **Qualificada X%:** `SIM >= X%` do universo (X configurável: 2/3, 3/4, 80%, etc.)
- **Unanimidade:** `SIM == 100%` do universo (com peso)
- **Mínimo + maioria:** exige quórum mínimo e depois maioria simples (ex.: mínimo 50% presentes e depois SIM>NÃO)

### 4.3 Tratamento de abstenção e nulos
Configuração por item:
- `abstencao_conta_no_universo`: sim/não
- `nulo_conta_no_universo`: sim/não
- `ausente_equivale_abstencao`: sim/não (normalmente **não**)

---

## 5) Tipos de voto (ballot types)

### 5.1 Simples (SIM/NÃO/ABSTENHO)
Campos:
- `choice`: YES | NO | ABSTAIN

### 5.2 Múltipla escolha (um entre N)
Ex.: escolher pauta A, B ou C.

---

## 6) Janela de votação e ciclo de vida

Estados por item:
- `DRAFT`, `OPEN`, `PAUSED`, `CLOSED`, `PUBLISHED`, `VOID`

---

## 7) Auditabilidade (mínimo)

Eventos:
- `VOTE_CAST`, `VOTE_CHANGED`, `VOTE_REJECTED`
- `ITEM_OPENED`, `ITEM_CLOSED`, `RESULT_PUBLISHED`

---

## 8) Contrato mínimo de API (proposta)

Portal → Condomínios:
- `POST /condominios/api/assembleias/:id/items/:itemId/votes`
- `GET  /condominios/api/assembleias/:id/items/:itemId/result`

Mediador:
- `POST /condominios/api/assembleias/:id/items/:itemId/open|close|publish`

---

## 9) Checklist de decisões

1) Peso padrão:
   - ( ) por pessoa  ( ) por unidade  ( ) por fração ideal
2) Para “unidade com 2 proprietários”:
   - ( ) 1 voto por unidade  ( ) fração por pessoa  ( ) mediador resolve conflito
3) Mudança de voto até fechar?
   - ( ) sim  ( ) não
4) Abstenção entra no universo?
   - ( ) sim  ( ) não  ( ) depende do item
5) Procuração entra já na V1?
   - ( ) sim  ( ) não (fase 2)

---

## 10) Próximo passo seguro

Ir para **(C) Schema Mongo real** com base em A+B.
