# Catálogo de Flags, Pré-condições e Rollback da Fase B/C

## Contexto

- WD Gestor significa a aplicação inteira.
- O objetivo estratégico continua sendo consolidar a arquitetura multi-tenant com database por unidade.
- A Fase A consolidou a matriz inicial em `docs/multi-tenant-domain-matrix.md`.
- A Fase B já consolidou o plano em `docs/tenant-phase-b-auth-context-plan.md`, o modelo operacional em `docs/gestor-operational-auth-context-model.md`, o inventário de fallbacks em `docs/gestor-fallback-inventory.md` e o catálogo de globais legítimos em `docs/gestor-global-scope-catalog.md`.
- Este documento não propõe ativação imediata. Ele fecha o catálogo operacional de flags, pré-condições, critérios de ativação, sinais de regressão e rollback para uma futura passagem controlada da Fase B para a Fase C.
- PostgreSQL permanece fora deste artefato.

## Objetivo

Catalogar:

1. flags já existentes;
2. flags inferidas ou propostas;
3. flags que não devem existir ou não devem ser criadas agora;
4. a ordem segura de rollout;
5. os gates obrigatórios antes de qualquer entrada na Fase C.

## Leitura operacional

- Flag não substitui semântica fechada.
- A ordem segura continua sendo:
  1. auth-context como fonte canônica de contexto;
  2. `user_memberships` como fonte de vínculo;
  3. enforcement mais amplo tenant-sensitive;
  4. multi-db por unidade;
  5. PostgreSQL fora deste plano.
- Flags aqui listadas existem para controlar rollout, rollback e observabilidade, não para esconder dívida sem nome.

## Flags já existentes

### 1. Resolvedor de auth-context v1

| Campo | Registro |
| --- | --- |
| nome conhecido ou nome proposto | nome não consolidado documentalmente; tratar como flag existente do resolvedor de auth-context v1 |
| estado atual | existente no runtime e usada em checkpoints; não ativar agora |
| o que controla | alterna o resolvedor entre ramo `legacy` e ramo `auth-context-v1` para `GET /gestor/auth/context`, seleção de unidade, troca de unidade e contratos correlatos |
| domínios impactados | auth-context, login pós-auth, `/gestor/api/usuario`, `/gestor/api/modulos`, seleção pendente, cluster e guards auxiliares |
| pré-condições para ativar | semântica de auth-context fechada; projeção de sessão delimitada; regras de `global_role`, seleção pendente e contexto ativo documentadas |
| testes obrigatórios antes de ativar | `tests/gestor-auth-context-get-runtime-contract.test.js`; `tests/gestor-auth-context-select-unit-runtime-contract.test.js`; `tests/gestor-auth-context-switch-unit-runtime-contract.test.js`; `tests/gestor-auth-user-endpoint-context.test.js`; `tests/gestor-auth-user-endpoint-runtime-contract.test.js` |
| sinais de regressão | `source` voltando inesperadamente para `legacy`; seleção pendente rompida; payload de `/gestor/api/usuario` perdendo coerência; sessões sem contexto ativo sendo promovidas silenciosamente |
| plano de rollback | desligar o resolvedor v1 e retornar ao ramo legado documentado; manter sessão e contratos externos sem mudança estrutural |
| pode ser ativada isoladamente ou exige sequência | exige sequência; é a primeira etapa formal do rollout B→C |

### 2. `WDG_MULTI_TENANT`

| Campo | Registro |
| --- | --- |
| nome conhecido ou nome proposto | `WDG_MULTI_TENANT` |
| estado atual | existente; documentada como chave de enforcement no runtime |
| o que controla | endurecimento do comportamento tenant-sensitive em middlewares como `requireUnitScope` e correlatos, evitando aceitar escopo global quando o enforcement estiver ligado |
| domínios impactados | Gestor tenant-sensitive, Condomínios V2, bordas com `requireUnitScope`, feedback widget, funcionários, funções, setores, recursos e corredores equivalentes |
| pré-condições para ativar | fallbacks perigosos inventariados; globais legítimos catalogados; bordas críticas com `requireUnitScope` já comprovadas; domínios híbridos com regra explícita |
| testes obrigatórios antes de ativar | `tests/gestor.requireUnitScope.test.js`; `tests/gestor-api-unidades-cluster-runtime-contract.test.js`; suites de runtime de funcionários, funções, setores, recursos, feedback e `tests/condominios.requireUnitScope.test.js` |
| sinais de regressão | bloqueios 400 ou 403 indevidos em leitura válida; rotas contextuais sem `unitScope` claro; writes tentando nascer de `GLOBAL_SCOPE`; OFF/ON de Condomínios deixando de preservar contrato |
| plano de rollback | desligar `WDG_MULTI_TENANT` para voltar ao enforcement mais permissivo já documentado, mantendo checkpoint explícito dos corredores que continuarem protegidos por lógica local |
| pode ser ativada isoladamente ou exige sequência | exige sequência; só depois da estabilização do auth-context e do vínculo contextual |

### 3. `ENABLE_CONDOMINIOS_WRAPPER`

| Campo | Registro |
| --- | --- |
| nome conhecido ou nome proposto | `ENABLE_CONDOMINIOS_WRAPPER` |
| estado atual | existente e validada documentalmente |
| o que controla | wrapper estrutural do módulo Condomínios no registry e sua montagem compatível OFF/ON |
| domínios impactados | montagem do módulo Condomínios, alias `/condominio`, contrato público de rotas do módulo |
| pré-condições para ativar | paridade OFF/ON verde; contrato de rotas idêntico; corredor V2 estável nos slices já alinhados |
| testes obrigatórios antes de ativar | suites de paridade OFF/ON de Condomínios; `tests/condominios.v2.parity.test.js`; `tests/condominios.v2.parity.matrix.test.js`; `tests/condominios.requireUnitScope.test.js` |
| sinais de regressão | dupla montagem do módulo; perda de alias; diferença de contrato entre OFF e ON |
| plano de rollback | desligar `ENABLE_CONDOMINIOS_WRAPPER` e voltar ao caminho anterior do registry |
| pode ser ativada isoladamente ou exige sequência | pode ser tratada isoladamente no eixo de montagem, mas não resolve semântica multi-tenant por si só |

### 4. `WDG_FLAG_CONDOMINIOS_APP_V2`

| Campo | Registro |
| --- | --- |
| nome conhecido ou nome proposto | `WDG_FLAG_CONDOMINIOS_APP_V2` |
| estado atual | existente; bifurcação V1/V2 ainda documentada |
| o que controla | escolha do corredor V1 ou V2 dentro do módulo Condomínios |
| domínios impactados | blocos, andares, unidades relacionadas e outros corredores V2 do módulo |
| pré-condições para ativar | paridade V1/V2 comprovada nas famílias-alvo; `requireUnitScope` alinhado nos corredores críticos; regra funcional fechada para as famílias ligadas |
| testes obrigatórios antes de ativar | `tests/condominios.v2.parity.test.js`; `tests/condominios.v2.parity.matrix.test.js`; `tests/condominios.blocos.microcut.test.js`; `tests/condominios.requireUnitScope.test.js` |
| sinais de regressão | divergência OFF/ON de payload ou status; V2 sem exigir `unidadeId` onde já foi consolidado; V1 e V2 abrindo comportamentos incompatíveis |
| plano de rollback | desligar `WDG_FLAG_CONDOMINIOS_APP_V2` e voltar ao corredor OFF documentado |
| pode ser ativada isoladamente ou exige sequência | pode ser tratada isoladamente no módulo Condomínios, mas não deve ser confundida com rollout da Fase C do Gestor |

### 5. `ENABLE_GESTOR_WRAPPER`

| Campo | Registro |
| --- | --- |
| nome conhecido ou nome proposto | `ENABLE_GESTOR_WRAPPER` |
| estado atual | existente e validada documentalmente |
| o que controla | wrapper explícito do módulo Gestor no registry do servidor |
| domínios impactados | montagem do Gestor em `/gestor`, registry do servidor e paridade macro OFF/ON do módulo |
| pré-condições para ativar | provas de paridade macro e estrutural do wrapper verdes |
| testes obrigatórios antes de ativar | `tests/gestor-registry-wrapper-parity.test.js`; `tests/gestor-registry-wrapper-structural-seam.test.js` |
| sinais de regressão | montagem duplicada, falta de mount ou diferença funcional OFF/ON |
| plano de rollback | desligar `ENABLE_GESTOR_WRAPPER` e voltar à montagem direta anterior |
| pode ser ativada isoladamente ou exige sequência | pode ser ativada isoladamente no eixo de montagem; não substitui rollout de auth-context ou enforcement |

## Flags propostas

### 6. `WDG_FLAG_GESTOR_AUTH_CONTEXT_V1_CANONICAL`

| Campo | Registro |
| --- | --- |
| nome conhecido ou nome proposto | `WDG_FLAG_GESTOR_AUTH_CONTEXT_V1_CANONICAL` |
| estado atual | proposta |
| o que controla | tornaria explícita a passagem do auth-context de compatibilidade parcial para fonte canônica do Gestor |
| domínios impactados | `requireLogin`, `requireRole`, `/gestor/api/usuario`, `/gestor/api/modulos`, seleção pendente, cluster e projeção de sessão |
| pré-condições para ativar | modelo semântico fechado; inventário de fallbacks concluído; catálogo de globais legítimos concluído; checkpoints críticos do auth-context verdes |
| testes obrigatórios antes de ativar | todas as suites de auth-context, user endpoint, módulos, cluster e login pós-auth já congeladas em checkpoints |
| sinais de regressão | `/gestor/api/usuario` ou `/gestor/api/modulos` retornando shape legado incoerente; `needs_selection` quebrado; `global_role` exigindo unidade ativa sem motivo |
| plano de rollback | desligar a flag e voltar à projeção compat documentada, preservando o ramo legado como fallback controlado |
| pode ser ativada isoladamente ou exige sequência | exige sequência; é o primeiro passo lógico da passagem B→C |

### 7. `WDG_FLAG_GESTOR_USER_MEMBERSHIPS_RUNTIME`

| Campo | Registro |
| --- | --- |
| nome conhecido ou nome proposto | `WDG_FLAG_GESTOR_USER_MEMBERSHIPS_RUNTIME` |
| estado atual | proposta |
| o que controla | faria `user_memberships` deixar de ser apenas estrutura provisionada e passar a sustentar o vínculo contextual no runtime |
| domínios impactados | login, seleção de unidade, troca de unidade, usuários administrativos, cluster, autorização contextual e projeção de sessão |
| pré-condições para ativar | backfill executado e validado; runbook de fase 2 concluído; anomalias bloqueantes inexistentes; auth-context já canônico |
| testes obrigatórios antes de ativar | suites de auth-context, login, seleção pendente, cluster, usuários administrativos e qualquer prova focal que dependa de membership resolvida |
| sinais de regressão | membership ausente ou incorreta no login; usuários contextuais sem unidade válida; master/admin dependendo indevidamente de memberships; divergência entre sessão e auth-context |
| plano de rollback | desligar a flag e voltar a usar o legado como fonte de vínculo operacional, mantendo `user_memberships` apenas provisionada |
| pode ser ativada isoladamente ou exige sequência | exige sequência; só depois do auth-context canônico |

### 8. `WDG_FLAG_GESTOR_TENANT_ENFORCEMENT_EXPANDED`

| Campo | Registro |
| --- | --- |
| nome conhecido ou nome proposto | `WDG_FLAG_GESTOR_TENANT_ENFORCEMENT_EXPANDED` |
| estado atual | proposta |
| o que controla | ampliação coordenada do enforcement tenant-sensitive para famílias ainda híbridas do Gestor |
| domínios impactados | usuários, unidades, funcionários, funções, setores, recursos, feedback e páginas contextuais |
| pré-condições para ativar | auth-context canônico; `user_memberships` como vínculo efetivo; fallbacks perigosos inventariados; globais legítimos listados; bordas críticas já provadas |
| testes obrigatórios antes de ativar | runtime-contracts críticos do Gestor, parity e watchdogs; suites focais de cluster, usuários, funcionários, funções, setores, recursos, feedback |
| sinais de regressão | bloqueios generalizados em caminhos válidos; aumento de `403/409/400` fora do esperado; escapes por `GLOBAL_SCOPE`; perda de visões globais legítimas para master/admin |
| plano de rollback | desligar a flag, preservar apenas os endurecimentos já materializados e voltar ao estado híbrido controlado documentado |
| pode ser ativada isoladamente ou exige sequência | exige sequência; só depois de auth-context e memberships |

### 9. `WDG_FLAG_MULTI_DB_PER_UNIDADE`

| Campo | Registro |
| --- | --- |
| nome conhecido ou nome proposto | `WDG_FLAG_MULTI_DB_PER_UNIDADE` |
| estado atual | proposta |
| o que controla | rollout operacional mais explícito da resolução multi-db por unidade como comportamento amplamente ativado |
| domínios impactados | resolveConnection, resolveModel, repositórios tenant-aware e superfícies que já dependem de unitScope |
| pré-condições para ativar | semântica fechada; enforcement estável; domínios críticos com fronteira clara; provisioning e module bootstrap documentados; rollback de ambiente documentado |
| testes obrigatórios antes de ativar | watchdogs do Gestor, suites focais com `req.unitScope`, contratos de provisioning e qualquer parity crítica dos módulos envolvidos |
| sinais de regressão | lookup no banco errado, dados cruzados entre unidades, timeouts ou falhas de conexão, writes indo para db incorreta |
| plano de rollback | desligar a flag e voltar ao comportamento anterior de roteamento conhecido, sem tocar em PostgreSQL |
| pode ser ativada isoladamente ou exige sequência | exige sequência; é etapa posterior ao enforcement mais amplo |

### 10. `WDG_FLAG_GESTOR_LEGACY_COMPAT_SHIMS`

| Campo | Registro |
| --- | --- |
| nome conhecido ou nome proposto | `WDG_FLAG_GESTOR_LEGACY_COMPAT_SHIMS` |
| estado atual | proposta |
| o que controla | toggle explícito para manter ou reduzir projeções legadas como `req.session.user` e reidratações auxiliares |
| domínios impactados | `requireLogin`, `requireRole`, `/gestor/api/usuario`, `/gestor/api/modulos`, páginas antigas e owners legados |
| pré-condições para ativar | inventário de fallbacks fechado; auth-context canônico; gates de runtime verdes; dependências legadas conhecidas |
| testes obrigatórios antes de ativar | suites de auth-context, user endpoint, módulos, pages críticas e guards estruturais |
| sinais de regressão | owners antigos falhando sem `req.session.user`; payloads ricos desaparecendo; login ou navegação quebrando em páginas antigas |
| plano de rollback | religar as compat shims e voltar à projeção legado documentada |
| pode ser ativada isoladamente ou exige sequência | não deve ser primeira; só depois de auth-context e memberships estabilizados |

## Flags que não devem existir ou não devem ser criadas agora

### 11. Flag de PostgreSQL

| Campo | Registro |
| --- | --- |
| nome conhecido ou nome proposto | não criar agora |
| estado atual | proibida neste estágio |
| o que controlaria | rollout de PostgreSQL ou de qualquer dupla persistência relacional |
| domínios impactados | todo o produto |
| pré-condições para ativar | fora de escopo da Fase B/C atual |
| testes obrigatórios antes de ativar | não aplicável nesta fase |
| sinais de regressão | qualquer tentativa de abrir essa frente antes do fechamento da semântica multi-tenant |
| plano de rollback | não criar agora |
| pode ser ativada isoladamente ou exige sequência | não deve existir neste momento |

### 12. Flag por microcorredor sem semântica fechada

| Campo | Registro |
| --- | --- |
| nome conhecido ou nome proposto | não criar flags oportunistas por handler isolado |
| estado atual | não recomendada |
| o que controlaria | toggles pontuais em handlers ou services só para “fazer passar” corredores híbridos sem semântica fechada |
| domínios impactados | qualquer família híbrida do Gestor |
| pré-condições para ativar | não aplicável |
| testes obrigatórios antes de ativar | não aplicável |
| sinais de regressão | explosão de combinações OFF/ON sem dono semântico; rollback confuso; aumento de dívida de compatibilidade |
| plano de rollback | não criar |
| pode ser ativada isoladamente ou exige sequência | não deve existir agora |

### 13. Flag para mascarar fallback perigoso

| Campo | Registro |
| --- | --- |
| nome conhecido ou nome proposto | não criar flag para autorizar `GLOBAL_SCOPE` difuso ou sessão concorrente |
| estado atual | não permitida |
| o que controlaria | autorização contextual baseada em ausência de escopo ou em projeção legado concorrente |
| domínios impactados | funções, setores, recursos, feedback contextual, páginas contextuais, writes em geral |
| pré-condições para ativar | nenhuma; o caso é semanticamente inválido |
| testes obrigatórios antes de ativar | não aplicável |
| sinais de regressão | qualquer proposta de “temporariamente aceitar global” em domínio tenant-sensitive |
| plano de rollback | não criar |
| pode ser ativada isoladamente ou exige sequência | não deve existir agora |

## Ordem segura de rollout

### Etapa 1 — Auth-context primeiro

- Tornar explícito o resolvedor canônico de auth-context.
- Fechar o contrato de `global_role`, seleção pendente, `active_unidade_id` e projeção mínima de sessão.
- Não avançar se `/gestor/api/usuario`, `/gestor/api/modulos`, `GET /gestor/auth/context`, `POST /gestor/auth/select-unit` e `POST /gestor/auth/switch-unit` não estiverem verdes.

### Etapa 2 — `user_memberships` como fonte de vínculo

- Só depois do auth-context canônico.
- Exigir backfill validado, anomalias triadas e rollback de dados documentado.
- Confirmar que `global_role` continua global e não passa a depender indevidamente de membership.

### Etapa 3 — Enforcement mais amplo

- Só depois da etapa 2.
- Expandir enforcement tenant-sensitive para os domínios híbridos remanescentes do Gestor.
- Preservar explicitamente os globais legítimos já catalogados.

### Etapa 4 — Multi-db por unidade

- Só depois da etapa 3.
- Tratar como rollout de infraestrutura sobre semântica já estabilizada.
- Exigir rollback operacional e checkpoints claros por domínio.

### Etapa 5 — PostgreSQL fora

- Não entra nesta sequência.
- Qualquer discussão futura depende do fechamento completo dos gates anteriores.

## Gates obrigatórios antes de qualquer Fase C

| Gate | Exigência |
| --- | --- |
| baseline verde | `npm test` verde e suites focais críticas verdes |
| matriz de domínios revisada | `docs/multi-tenant-domain-matrix.md` revisada e coerente com o estado atual |
| fallbacks perigosos inventariados | `docs/gestor-fallback-inventory.md` fechado e atualizado |
| globais legítimos catalogados | `docs/gestor-global-scope-catalog.md` fechado |
| user_memberships pronto | backfill documentado, anomalias triadas e pré-condições de runtime fechadas |
| rollback documentado | rollback por flag e rollback operacional de dados já descritos |
| runtime/parity críticos verdes | auth-context, cluster, usuários, módulos, funcionários, feedback e wrappers OFF/ON sem regressão |

## Sinais de regressão a observar em qualquer rollout futuro

- `401`, `403`, `409` ou `400` fora do envelope já congelado nos checkpoints críticos;
- `/gestor/api/usuario` e `/gestor/api/modulos` perdendo coerência entre ramo legado e ramo canônico;
- `master` e `admin` perdendo visão global legítima ou ganhando write contextual sem unidade ativa;
- seleção pendente sendo convertida em contexto artificial;
- `GLOBAL_SCOPE` reaparecendo como atalho em domínio contextual;
- mismatch entre `gestorAuthContext`, `req.session.user`, `req.user` e `req.unitScope`;
- OFF/ON de wrappers deixando de preservar paridade macro.

## Estratégia de rollback

### Rollback por camada

- camada auth-context: desligar o resolvedor canônico e voltar ao ramo legado documentado;
- camada memberships: voltar `user_memberships` para papel passivo de estrutura provisionada;
- camada enforcement: desligar o enforcement expandido e retornar ao estado híbrido controlado;
- camada multi-db: desligar o rollout explícito de multi-db e voltar ao comportamento anterior conhecido;
- camada de wrapper: usar OFF/ON já provado para Gestor e Condomínios.

### Regras de rollback

- rollback deve sempre preceder qualquer tentativa de microajuste quente em runtime;
- rollback documental deve citar a flag, o gatilho de reversão e o checkpoint de referência;
- quando houver impacto em dados, o rollback da flag não substitui o rollback operacional de snapshot ou backup;
- PostgreSQL não participa desta estratégia.

## Critérios de pronto deste artefato

- documento criado;
- flags existentes catalogadas;
- flags propostas catalogadas;
- flags proibidas ou não recomendadas listadas;
- ordem segura de rollout definida;
- gates obrigatórios para Fase C definidos;
- rollback descrito;
- nenhum código alterado;
- nenhum teste alterado.

## Escopo deste documento

- documento estritamente operacional e documental;
- sem alteração funcional;
- sem alteração de testes;
- sem proposta de ativação imediata;
- sem microcorte isolado;
- sem preparação para PostgreSQL.