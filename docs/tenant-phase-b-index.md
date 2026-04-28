# Índice Executivo — Fase B Multi-tenant

## Contexto

- WD Gestor, neste documento, significa a aplicação inteira.
- O objetivo principal continua sendo transformar o WD Gestor em arquitetura multi-tenant com database por unidade.
- A Fase A gerou a matriz inicial de domínios em `docs/multi-tenant-domain-matrix.md`.
- A Fase B organiza e consolida os artefatos de semântica operacional, especialmente auth-context, fallbacks, globais legítimos, flags, gates e rollback.
- PostgreSQL permanece fora desta fase.
- Nenhuma flag deve ser ativada sem passar pelos gates documentais e operacionais já definidos.
- Este documento é um índice executivo: ele explica como usar os artefatos da Fase B, em que ordem lê-los e qual decisão cada um sustenta.

## Estado atual

- baseline verde de referência: `npm test` com 2012 testes, 2010 pass, 0 fail, 2 skipped;
- branch `migration/refactor-core` tratada como limpa e alinhada com `origin`;
- fase documental da Fase B consolidada, sem patch funcional nesta rodada;
- Fase C ainda não começou como implementação controlada;
- PostgreSQL continua explicitamente fora.

## Ordem de leitura recomendada

1. `docs/migration-status.md`
2. `docs/multi-tenant-domain-matrix.md`
3. `docs/tenant-phase-b-auth-context-plan.md`
4. `docs/gestor-operational-auth-context-model.md`
5. `docs/gestor-fallback-inventory.md`
6. `docs/gestor-global-scope-catalog.md`
7. `docs/tenant-phase-bc-flags-rollout.md`

## Como usar cada documento

### 1. `docs/migration-status.md`

**Finalidade**

- Registrar o estado vivo da migração no produto inteiro.
- Consolidar checkpoints, frentes pausadas, corredores já drenados e restrições estratégicas ativas.

**Quando consultar**

- No início de qualquer nova rodada.
- Antes de reabrir frente de trabalho, validar baseline ou justificar uma nova decisão documental.

**Qual decisão sustenta**

- Se há ou não trilha segura ativa.
- Se a próxima rodada deve ser documental, arquitetural ou de implementação controlada.

**Próximos documentos que dependem dele**

- `docs/multi-tenant-domain-matrix.md`
- `docs/tenant-phase-b-auth-context-plan.md`
- todo o restante da Fase B como leitura derivada do estado consolidado.

### 2. `docs/multi-tenant-domain-matrix.md`

**Finalidade**

- Classificar os domínios do WD Gestor por natureza multi-tenant, fonte provável de escopo, dependência de `unitScope`, uso de legado e risco principal.

**Quando consultar**

- Quando a dúvida for macro: qual domínio é híbrido, qual é tenant por unidade, qual é global legítimo e qual ainda depende de decisão semântica.

**Qual decisão sustenta**

- Quais famílias entram ou não na Fase B.
- Quais fronteiras são globais legítimas versus compatibilidades temporárias.

**Próximos documentos que dependem dele**

- `docs/tenant-phase-b-auth-context-plan.md`
- `docs/gestor-operational-auth-context-model.md`
- `docs/gestor-fallback-inventory.md`
- `docs/gestor-global-scope-catalog.md`
- `docs/tenant-phase-bc-flags-rollout.md`

### 3. `docs/tenant-phase-b-auth-context-plan.md`

**Finalidade**

- Definir o plano executivo da Fase B.
- Fechar o problema semântico: identidade global, vínculo por unidade, operação contextual, globais legítimos e compat legado.

**Quando consultar**

- Quando for preciso entender o objetivo exato da Fase B.
- Antes de discutir subfases, pré-condições, user memberships, gates ou entrada futura na Fase C.

**Qual decisão sustenta**

- O que a Fase B precisa resolver antes de qualquer ativação de runtime mais ampla.
- A ordem macro: auth-context, memberships, globais legítimos, fallbacks e gate para Fase C.

**Próximos documentos que dependem dele**

- `docs/gestor-operational-auth-context-model.md`
- `docs/gestor-fallback-inventory.md`
- `docs/gestor-global-scope-catalog.md`
- `docs/tenant-phase-bc-flags-rollout.md`

### 4. `docs/gestor-operational-auth-context-model.md`

**Finalidade**

- Traduzir o plano da Fase B em regras operacionais explícitas para o módulo Gestor.
- Fixar precedência entre identidade global, `user_memberships`, `req.unitScope`, `req.session.user`, `global_role`, `active_unidade_id` e `GLOBAL_SCOPE`.

**Quando consultar**

- Quando a dúvida for de semântica operacional: o que é fonte correta de contexto, o que é só projeção e o que é fallback proibido.

**Qual decisão sustenta**

- Como o runtime correto deve se comportar, sem ainda propor patch.
- O que conta como regra canônica versus compatibilidade transitória.

**Próximos documentos que dependem dele**

- `docs/gestor-fallback-inventory.md`
- `docs/gestor-global-scope-catalog.md`
- `docs/tenant-phase-bc-flags-rollout.md`

### 5. `docs/gestor-fallback-inventory.md`

**Finalidade**

- Inventariar os fallbacks do Gestor e classificá-los como remover, documentar, manter temporariamente, global legítimo ou substituir pela fonte canônica correta.

**Quando consultar**

- Quando a decisão envolver risco de compat legado.
- Antes de escolher qualquer alvo técnico futuro na passagem da Fase B para a Fase C.

**Qual decisão sustenta**

- Quais fallbacks são aceitáveis por transição.
- Quais fallbacks são perigosos e devem ser priorizados como dívida explícita.

**Próximos documentos que dependem dele**

- `docs/gestor-global-scope-catalog.md`
- `docs/tenant-phase-bc-flags-rollout.md`

### 6. `docs/gestor-global-scope-catalog.md`

**Finalidade**

- Separar o que é global legítimo do que é compat legado e do que já é uso perigoso de `GLOBAL_SCOPE`.

**Quando consultar**

- Quando surgir a dúvida se um caso pode permanecer global ou se precisa migrar para contexto por unidade.
- Antes de permitir qualquer visão global, catálogo global ou ramo privilegiado sem unidade ativa.

**Qual decisão sustenta**

- Quais casos podem usar ramo global explicitamente documentado.
- Quais superfícies não devem mais se apoiar em ausência de escopo contextual.

**Próximos documentos que dependem dele**

- `docs/tenant-phase-bc-flags-rollout.md`
- qualquer futura decisão de gate da Fase C.

### 7. `docs/tenant-phase-bc-flags-rollout.md`

**Finalidade**

- Catalogar flags existentes, flags propostas, flags proibidas, ordem segura de rollout, sinais de regressão, gates e rollback para a passagem B→C.

**Quando consultar**

- Antes de discutir ativação de flags, rollout controlado, rollback ou início formal da Fase C.

**Qual decisão sustenta**

- Se existe maturidade documental para sair da consolidação semântica e entrar em implementação controlada.
- Em que ordem qualquer rollout futuro deve acontecer.

**Próximos documentos que dependem dele**

- o gate executivo de entrada na Fase C;
- futuros planos de implementação controlada, ainda não abertos.

## Mapa de responsabilidades

| Responsabilidade | Documento principal |
| --- | --- |
| status consolidado da migração | `docs/migration-status.md` |
| matriz de domínios | `docs/multi-tenant-domain-matrix.md` |
| plano semântico da Fase B | `docs/tenant-phase-b-auth-context-plan.md` |
| modelo operacional | `docs/gestor-operational-auth-context-model.md` |
| inventário de fallbacks | `docs/gestor-fallback-inventory.md` |
| catálogo de globais legítimos | `docs/gestor-global-scope-catalog.md` |
| flags, gates e rollback | `docs/tenant-phase-bc-flags-rollout.md` |

## Gates antes da Fase C

- matriz de domínios revisada;
- modelo operacional validado;
- fallbacks classificados;
- globais legítimos catalogados;
- flags e rollback catalogados;
- baseline verde preservada;
- decisão explícita de iniciar implementação controlada;
- PostgreSQL fora.

## Próximas decisões pendentes

- qual fallback será o primeiro alvo técnico da passagem documental para a implementação controlada;
- quando `user_memberships` passará a sustentar o runtime de forma autoritativa;
- quais usos de `GLOBAL_SCOPE` são removíveis primeiro sem abrir uma frente ampla demais;
- quais flags podem ser testadas sem rollout amplo;
- quais contratos de runtime serão obrigatórios para liberar cada gate futuro.

## O que continua fora de escopo

- PostgreSQL;
- Portal do Morador;
- Escalas;
- Condomínios;
- Assembleia;
- reescrita ampla de `api.db.js` e `auth.db.js`;
- microcorte oportunista;
- cleanup cosmético.

## Leitura executiva resumida

- `docs/migration-status.md` responde onde estamos.
- `docs/multi-tenant-domain-matrix.md` responde o que está classificado e o que ainda é híbrido.
- `docs/tenant-phase-b-auth-context-plan.md` responde por que a Fase B existe e o que ela precisa fechar.
- `docs/gestor-operational-auth-context-model.md` responde qual é a semântica operacional correta.
- `docs/gestor-fallback-inventory.md` responde o que ainda é compatibilidade, risco ou dívida controlada.
- `docs/gestor-global-scope-catalog.md` responde o que pode continuar global legitimamente.
- `docs/tenant-phase-bc-flags-rollout.md` responde como, em que ordem e sob quais gates uma futura Fase C poderia começar.

## Critério de pronto do índice

- documento criado;
- todos os artefatos listados;
- ordem de leitura clara;
- gates da Fase C explícitos;
- sem alteração de código;
- sem alteração de testes.

## Escopo deste artefato

- documento estritamente documental;
- sem alteração funcional;
- sem alteração de código;
- sem alteração de testes;
- sem ativação de flags;
- sem proposta de patch imediato;
- sem preparação para PostgreSQL.