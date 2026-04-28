# Catálogo de Globais Legítimos do Gestor

## Contexto

- WD Gestor significa a aplicação inteira, mas este catálogo foca apenas no módulo Gestor.
- O objetivo estratégico continua sendo a consolidação da arquitetura multi-tenant com database por unidade.
- A Fase A consolidou a matriz inicial em `docs/multi-tenant-domain-matrix.md`.
- A Fase B já consolidou o plano em `docs/tenant-phase-b-auth-context-plan.md`, o modelo operacional em `docs/gestor-operational-auth-context-model.md` e o inventário de fallbacks em `docs/gestor-fallback-inventory.md`.
- Este documento fecha um recorte específico da Fase B: distinguir o que é global legítimo, o que ainda é compatibilidade transitória e o que já deve ser tratado como uso perigoso de `GLOBAL_SCOPE`.
- Não há proposta de patch funcional, não há alteração de testes, não há ativação de flags e não há preparação para PostgreSQL.

## Objetivo

Catalogar os casos globais do Gestor e separar com clareza:

1. `GLOBAL_SCOPE` legítimo;
2. `GLOBAL_SCOPE` compat legado;
3. `GLOBAL_SCOPE` perigoso.

O foco não é a implementação, mas a semântica operacional correta de cada caso.

## Categorias operacionais

| Categoria | Regra geral |
| --- | --- |
| identidade global | dado global do usuário, independente de unidade ativa |
| privilégio global | ramo privilegiado legítimo, sem depender de contexto de unidade |
| catálogo administrativo global | catálogo ou lookup administrativo que não representa operação contextual |
| visão global legítima | leitura global explicitamente permitida e documentada |
| configuração global | settings ou contratos globais da aplicação |
| provisioning ou snapshot global | estado global de orquestração e auditoria do tenant base |
| compat legado | uso transitório aceito com cerca operacional e destino explícito |
| perigoso ou não permitido | uso global que mascara ausência de escopo contextual ou amplia autorização indevida |

## Catálogo por caso

### 1. Usuários como identidade

| Campo | Registro |
| --- | --- |
| nome do caso | usuário global autenticável |
| categoria | identidade global |
| descrição | `User` permanece como identidade global do Gestor para e-mail, credenciais, lockout, remember token e reset. |
| por que pode ou não ser global | pode ser global porque identidade não equivale a contexto operacional por unidade. |
| fonte correta de escopo | identidade global do usuário |
| pode usar `GLOBAL_SCOPE`? | sim, quando o corredor estiver tratando apenas identidade global |
| pode usar `req.session.user`? | apenas como projeção derivada |
| destino futuro | permanecer global, explicitamente separado de vínculo contextual e de autorização tenant-sensitive |
| risco | baixo |
| testes ou checkpoints próximos | `docs/gestor-auth-context-phase3-spec.md`; `docs/checkpoints/gestor-auth-login-pre-auth-gate-data-facade-vigesima-segunda-fatia-macro.md`; `docs/checkpoints/gestor-auth-recovery-reset-token-data-facade-vigesima-primeira-fatia-macro.md` |

### 2. `global_role`

| Campo | Registro |
| --- | --- |
| nome do caso | privilégio global por `global_role` |
| categoria | privilégio global |
| descrição | `global_role` representa privilégio global legítimo para `master` e `admin`, sem depender de unidade ativa. |
| por que pode ou não ser global | pode ser global porque a regra funcional explicitamente separa privilégio global de vínculo contextual. |
| fonte correta de escopo | `global_role` no auth-context e na identidade global |
| pode usar `GLOBAL_SCOPE`? | sim, quando o ramo global privilegiado já estiver documentado |
| pode usar `req.session.user`? | apenas como projeção de `legacy_role` |
| destino futuro | permanecer como ramo privilegiado explícito, nunca como simulação de contexto ativo |
| risco | baixo-médio |
| testes ou checkpoints próximos | `docs/gestor-auth-context-phase3-spec.md`; `docs/checkpoints/gestor-auth-context-get-runtime-contract.md`; `docs/checkpoints/gestor-api-unidades-cluster-runtime-contract.md` |

### 3. `master` e `admin` sem unidade ativa

| Campo | Registro |
| --- | --- |
| nome do caso | master/admin global sem unidade ativa |
| categoria | visão global legítima |
| descrição | Sessão autenticada global, sem `active_unidade_id`, aceita para fluxos documentados de consulta, catálogos e superfícies privilegiadas globais. |
| por que pode ou não ser global | pode ser global porque o produto já consolidou esse comportamento como legítimo em auth-context, cluster e consulta global específica. |
| fonte correta de escopo | `global_role` e fluxo privilegiado documentado |
| pode usar `GLOBAL_SCOPE`? | sim, apenas nos ramos globais privilegiados já legitimados |
| pode usar `req.session.user`? | apenas como projeção derivada de sessão global |
| destino futuro | permanecer como global legítimo, sem desbloquear writes contextuais sem unidade ativa |
| risco | médio se escapar do escopo de consulta |
| testes ou checkpoints próximos | `docs/checkpoints/gestor-auth-context-get-runtime-contract.md`; `docs/checkpoints/gestor-api-unidades-cluster-runtime-contract.md`; `docs/migration-status.md` |

### 4. Módulos

| Campo | Registro |
| --- | --- |
| nome do caso | catálogo global de módulos |
| categoria | catálogo administrativo global |
| descrição | Módulos são capacidades globais do produto e não pertencem a uma unidade como dado operacional. |
| por que pode ou não ser global | pode ser global porque é catálogo do produto, não execução contextual por tenant. |
| fonte correta de escopo | catálogo global com gating por auth-context |
| pode usar `GLOBAL_SCOPE`? | sim, no catálogo global e em leituras administrativas legitimadas |
| pode usar `req.session.user`? | apenas para projeção de compatibilidade e gating legado transitório |
| destino futuro | permanecer como catálogo global explícito, com autorização contextual separada do catálogo |
| risco | baixo-médio |
| testes ou checkpoints próximos | `docs/checkpoints/gestor-auth-modulos-canonical-result-data-facade-decima-sexta-fatia-macro.md`; `tests/gestor-auth-modulos-endpoint-structural-seam.test.js`; `tests/gestor-registry-wrapper-parity.test.js` |

### 5. Catálogos administrativos

| Campo | Registro |
| --- | --- |
| nome do caso | catálogos administrativos globais |
| categoria | catálogo administrativo global |
| descrição | Lookups, descritores e catálogos administrativos que não executam operação tenant-sensitive. |
| por que pode ou não ser global | pode ser global quando não carrega decisão operacional por unidade. |
| fonte correta de escopo | ramo administrativo global documentado |
| pode usar `GLOBAL_SCOPE`? | sim, quando o lookup é realmente administrativo e não operacional |
| pode usar `req.session.user`? | apenas para gating ou compatibilidade de navegação |
| destino futuro | permanecer listado como global legítimo e fora da categoria de fallback perigoso |
| risco | baixo |
| testes ou checkpoints próximos | `docs/gestor-operational-auth-context-model.md`; `docs/migration-status.md`; checkpoints de módulos e unidades administrativas em `docs/checkpoints/` |

### 6. Unidades administrativas

| Campo | Registro |
| --- | --- |
| nome do caso | unidade como catálogo administrativo |
| categoria | catálogo administrativo global |
| descrição | Parte administrativa de unidades, distinta da operação contextual por tenant, incluindo catálogos e dados globais de gestão da própria unidade como tenant base. |
| por que pode ou não ser global | pode ser global no ramo administrativo; não pode ser global quando a unidade vira contexto operacional de execução. |
| fonte correta de escopo | cluster canônico, ramo privilegiado ou catálogo administrativo global |
| pode usar `GLOBAL_SCOPE`? | sim, apenas no ramo administrativo legítimo |
| pode usar `req.session.user`? | só como projeção transitória; não para inventar autorização contextual |
| destino futuro | permanecer híbrido com separação mais explícita entre catálogo administrativo global e operação contextual |
| risco | médio |
| testes ou checkpoints próximos | `docs/gestor-provisioning-contract.md`; `docs/checkpoints/gestor-api-unidades-cluster-runtime-contract.md`; `docs/checkpoints/gestor-api-unidades-cluster-structural-seam-runtime-contract.md` |

### 7. Provisioning

| Campo | Registro |
| --- | --- |
| nome do caso | provisioning, snapshot e eventos globais |
| categoria | provisioning ou snapshot global |
| descrição | Snapshot global em `unit_provisioning_status` e trilha histórica em `unit_provisioning_events` representam o estado global da orquestração do tenant base por unidade. |
| por que pode ou não ser global | pode ser global porque é orquestração e auditoria do tenant base, não operação contextual do tenant. |
| fonte correta de escopo | contrato canônico de provisioning por `unidadeId` |
| pode usar `GLOBAL_SCOPE`? | sim, no armazenamento e leitura globais de snapshot e eventos |
| pode usar `req.session.user`? | apenas para autorização e acesso administrativo, nunca como fonte do dado |
| destino futuro | permanecer global como contrato de orquestração e auditoria |
| risco | baixo |
| testes ou checkpoints próximos | `docs/gestor-provisioning-contract.md`; `tests/gestor.provisioning.retry.test.js`; `docs/migration-status.md` |

### 8. Configurações globais

| Campo | Registro |
| --- | --- |
| nome do caso | configurações e settings globais |
| categoria | configuração global |
| descrição | Settings de aplicação e configurações não contextuais do Gestor, inclusive parte das configurações de widget. |
| por que pode ou não ser global | pode ser global quando não define autorização nem estado operacional por unidade. |
| fonte correta de escopo | coleção ou serviço global de settings |
| pode usar `GLOBAL_SCOPE`? | sim, quando o dado é realmente configuração global |
| pode usar `req.session.user`? | apenas para verificar acesso administrativo |
| destino futuro | permanecer como configuração global explicitamente separada de feedback contextual e de autorização |
| risco | baixo-médio |
| testes ou checkpoints próximos | `docs/gestor-provisioning-contract.md`; `docs/checkpoints/gestor-feedback-create-runtime-contract.md`; `tests/architecture/widget-settings-api-route-delegation-only.test.js` |

### 9. Funcionários em modo global de consulta

| Campo | Registro |
| --- | --- |
| nome do caso | funcionários em visão global de consulta |
| categoria | visão global legítima |
| descrição | `GET /gestor/funcionarios` pode exibir lista global apenas para `master` e `admin` sem unidade ativa, mantendo todas as ações contextuais bloqueadas. |
| por que pode ou não ser global | pode ser global porque foi consolidado como ramo privilegiado de consulta, não de gestão contextual. |
| fonte correta de escopo | `global_role` e regra documental explícita de consulta global |
| pode usar `GLOBAL_SCOPE`? | sim, apenas para a leitura global legitimada |
| pode usar `req.session.user`? | apenas como projeção da sessão global; não para desbloquear create, edit, delete, detalhe, foto ou anexo |
| destino futuro | permanecer como visão global de consulta claramente delimitada |
| risco | médio se ações contextuais escaparem do bloqueio |
| testes ou checkpoints próximos | `docs/migration-status.md`; `tests/gestor-funcionarios-get-by-id-runtime-contract.test.js` |

### 10. `GLOBAL_SCOPE` em `auth.db.js`

| Campo | Registro |
| --- | --- |
| nome do caso | `GLOBAL_SCOPE` no auth legado |
| categoria | compat legado |
| descrição | `auth.db.js` ainda centraliza partes globais legítimas do auth e também superfícies híbridas não totalmente segmentadas. |
| por que pode ou não ser global | pode ser global em identidade, reset, remember token e lockout; não pode permanecer amplo para tudo o que tocar contexto operacional. |
| fonte correta de escopo | identidade global; auth-context; ramo global legítimo explicitamente listado |
| pode usar `GLOBAL_SCOPE`? | sim, em parte; não como regra difusa para todo o auth |
| pode usar `req.session.user`? | apenas como projeção transitória do contexto autenticado |
| destino futuro | restringir `GLOBAL_SCOPE` ao que for identidade global legítima e migrar o restante para fronteiras semânticas explícitas |
| risco | médio-alto |
| testes ou checkpoints próximos | `docs/checkpoints/gestor-auth-login-pre-auth-gate-data-facade-vigesima-segunda-fatia-macro.md`; `docs/checkpoints/gestor-auth-recovery-request-json-data-facade-vigesima-fatia-macro.md`; `docs/checkpoints/gestor-auth-primeiro-acesso-data-facade-decima-oitava-fatia-macro.md` |

### 11. `GLOBAL_SCOPE` em `api.db.js`

| Campo | Registro |
| --- | --- |
| nome do caso | `GLOBAL_SCOPE` na bridge de leitura do Gestor |
| categoria | compat legado |
| descrição | `api.db.js` ainda preserva helpers e lookups com `GLOBAL_SCOPE` residual, mesmo após reduções locais da bridge. |
| por que pode ou não ser global | só pode ser global quando o fluxo for deliberadamente administrativo, privilegiado ou um lookup inequívoco; fora disso, é compatibilidade técnica. |
| fonte correta de escopo | `req.unitScope`, cluster canônico ou lookup canônico por unidade |
| pode usar `GLOBAL_SCOPE`? | só temporariamente e de forma documentada |
| pode usar `req.session.user`? | não como fonte material de tenant; no máximo como apoio de compatibilidade fora do caminho autoritativo |
| destino futuro | reduzir helper por helper, deixando `GLOBAL_SCOPE` apenas em ramos globais legítimos explícitos |
| risco | alto |
| testes ou checkpoints próximos | `docs/checkpoints/bridge-subfase-1.md`; `docs/checkpoints/bridge-subfase-2.md`; `tests/gestor-unidades-unit-scope-canonical.test.js`; `tests/gestor-funcionarios-funcoes-unit-scope-canonical.test.js` |

### 12. `req.session.user` sem unidade ativa

| Campo | Registro |
| --- | --- |
| nome do caso | sessão projetada sem unidade ativa |
| categoria | compat legado |
| descrição | Sessão autenticada que projeta `req.session.user` sem unidade ativa, seja por seleção pendente ou por ramo global privilegiado. |
| por que pode ou não ser global | pode existir globalmente como projeção; não pode ser tratada como autorização contextual pronta. |
| fonte correta de escopo | `req.session.gestorAuthContext`, `global_role` ou estado de seleção pendente |
| pode usar `GLOBAL_SCOPE`? | não por si só |
| pode usar `req.session.user`? | sim, como projeção; não como fonte de autorização material |
| destino futuro | sobreviver apenas como envelope transitório derivado do auth-context |
| risco | médio-alto se algum corredor usar a ausência de unidade como atalho para global legítimo |
| testes ou checkpoints próximos | `docs/checkpoints/gestor-auth-context-get-runtime-contract.md`; `docs/checkpoints/gestor-auth-user-endpoint-runtime-contract.md`; `docs/checkpoints/gestor-auth-login-post-auth-runtime-contract.md` |

### 13. Seleção pendente

| Campo | Registro |
| --- | --- |
| nome do caso | auth-context com seleção pendente |
| categoria | compat legado |
| descrição | Estado autenticado válido sem unidade ativa para usuários com múltiplas memberships, exigindo escolha explícita antes da operação contextual. |
| por que pode ou não ser global | pode existir sem unidade ativa, mas não deve ser reclassificado como visão global legítima comum. |
| fonte correta de escopo | `user_memberships` e `gestorAuthContext.needs_selection` |
| pode usar `GLOBAL_SCOPE`? | não |
| pode usar `req.session.user`? | apenas como projeção vazia de contexto; sem inventar `unidade_id` ou `funcionario_id` |
| destino futuro | permanecer como estado explícito do auth-context enquanto houver múltiplos vínculos |
| risco | médio |
| testes ou checkpoints próximos | `docs/checkpoints/gestor-auth-context-select-unit-runtime-contract.md`; `docs/checkpoints/gestor-auth-context-switch-unit-runtime-contract.md`; `docs/checkpoints/gestor-auth-context-get-runtime-contract.md` |

### 14. Feedback e widgets

| Campo | Registro |
| --- | --- |
| nome do caso | feedback e widgets híbridos |
| categoria | compat legado |
| descrição | O corredor de feedback combina widget canônico contextual, borda administrativa semeada por auth-context e compatibilidades de bridge e contrato legado. |
| por que pode ou não ser global | settings globais do widget podem ser globais; leitura e escrita de feedback não são globais por default. |
| fonte correta de escopo | `req.unitScope` no widget canônico; auth-context contextualizado no ramo administrativo |
| pode usar `GLOBAL_SCOPE`? | só em settings globais legítimos, não em leitura ou write contextual de feedback |
| pode usar `req.session.user`? | apenas como projeção de acesso administrativo transitório |
| destino futuro | separar completamente settings globais do feedback contextual, mantendo o escopo efetivo em `req.unitScope` ou auth-context canônico |
| risco | médio-alto |
| testes ou checkpoints próximos | `docs/checkpoints/gestor-feedback-create-runtime-contract.md`; `docs/checkpoints/gestor-feedback-detail-runtime-contract.md`; `docs/checkpoints/gestor-feedback-list-runtime-contract.md`; `docs/checkpoints/gestor-feedback-upload-runtime-contract.md`; `tests/architecture/widget-settings-api-route-delegation-only.test.js` |

### 15. Lookups auxiliares

| Campo | Registro |
| --- | --- |
| nome do caso | lookups auxiliares de cluster, unidades e setores |
| categoria | compat legado |
| descrição | Helpers de lookup e bridge ainda preservam parte do comportamento global para casos administrativos, privilegiados ou filtros não inequívocos. |
| por que pode ou não ser global | só podem ser globais quando o lookup é deliberadamente administrativo ou o filtro não resolve uma única unidade; fora disso, devem usar escopo canônico. |
| fonte correta de escopo | cluster canônico, `req.unitScope` ou filtro de unidade inequívoco |
| pode usar `GLOBAL_SCOPE`? | apenas temporariamente, nos ramos documentados como exceção |
| pode usar `req.session.user`? | não como fonte material de tenant |
| destino futuro | drenar os lookups para anchors canônicos e deixar `GLOBAL_SCOPE` apenas como compatibilidade residual documentada ou removê-lo |
| risco | médio-alto |
| testes ou checkpoints próximos | `docs/checkpoints/bridge-subfase-1.md`; `docs/checkpoints/bridge-subfase-2.md`; `docs/checkpoints/gestor-api-unidades-cluster-structural-seam-runtime-contract.md`; `tests/gestor-unidades-unit-scope-canonical.test.js` |

### 16. `GLOBAL_SCOPE` perigoso e não permitido

| Campo | Registro |
| --- | --- |
| nome do caso | uso global difuso em domínio contextual |
| categoria | perigoso ou não permitido |
| descrição | Qualquer uso de `GLOBAL_SCOPE` para resolver ausência de contexto em funções, setores, recursos, feedback contextual, pages contextuais ou writes do Gestor. |
| por que pode ou não ser global | não pode ser global porque mascara a ausência de `req.unitScope`, de contexto ativo ou de autorização contextual válida. |
| fonte correta de escopo | `req.unitScope`, auth-context resolvido e `user_memberships` |
| pode usar `GLOBAL_SCOPE`? | não |
| pode usar `req.session.user`? | não como substituto de contexto canônico |
| destino futuro | permanecer explicitamente proibido e tratado como dívida ou risco arquitetural sempre que reaparecer |
| risco | alto |
| testes ou checkpoints próximos | `docs/migration-status.md`; `docs/gestor-fallback-inventory.md`; suites focais de cluster, feedback, usuários administrativos, funções, setores e recursos citadas nos checkpoints do Gestor |

## Globais permitidos

| Caso | Justificativa operacional |
| --- | --- |
| usuários como identidade | identidade global não depende de unidade ativa |
| `global_role` | privilégio global legítimo explicitamente documentado |
| `master` e `admin` sem unidade ativa | visão global privilegiada já consolidada em fluxos documentados |
| módulos | catálogo global do produto |
| catálogos administrativos | não representam operação contextual |
| unidades administrativas | ramo administrativo global distinto de execução contextual |
| provisioning e snapshot global | orquestração e auditoria globais do tenant base |
| configurações globais | settings não contextuais da aplicação |
| funcionários em modo global de consulta | leitura global privilegiada explicitamente restrita a consulta |

## Globais temporários

| Caso | Condição para continuar existindo |
| --- | --- |
| `GLOBAL_SCOPE` em `auth.db.js` | apenas enquanto a segmentação semântica do auth legado não estiver completa |
| `GLOBAL_SCOPE` em `api.db.js` | apenas enquanto helpers residuais da bridge ainda não forem drenados |
| `req.session.user` sem unidade ativa | apenas como projeção transitória derivada do auth-context |
| seleção pendente | enquanto o produto suportar múltiplas memberships ativas sem escolha inicial |
| feedback e widgets híbridos | enquanto settings globais e corredores contextuais ainda conviverem com compatibilidade legado |
| lookups auxiliares | enquanto filtros não inequívocos e bridge residual ainda exigirem exceções documentadas |

## Globais proibidos

| Caso | Motivo operacional |
| --- | --- |
| `GLOBAL_SCOPE` difuso em domínio contextual | converte ausência de contexto em pseudo-global legítimo |
| `req.session.user.unidade_id` como autorização real | transforma projeção legado em fonte de decisão tenant-sensitive |
| `req.user.unidade_id` como fonte material concorrente | concorre com auth-context e com `req.unitScope` |
| write contextual sem `req.unitScope` | amplia risco de vazamento de tenant e autorização indevida |
| seleção pendente convertida em contexto artificial | destrói a semântica de múltiplos vínculos |

## Leitura operacional do catálogo

- Nem todo uso global é ruim.
- No Gestor atual, existem três grupos distintos:
  - globais legítimos que devem permanecer explicitamente listados;
  - globais temporários que ainda existem por compatibilidade estrutural controlada;
  - globais proibidos, que só escondem falta de escopo contextual.
- A regra de convergência continua sendo:
  - identidade global em `User` e `global_role`;
  - vínculo por unidade em `user_memberships`;
  - operação contextual efetiva em `req.unitScope`.

## Critérios de pronto deste artefato

- documento criado;
- casos globais catalogados por categoria;
- separação explícita entre global legítimo, compat legado e perigoso;
- casos mínimos obrigatórios incluídos;
- globais permitidos, temporários e proibidos listados;
- nenhum código alterado;
- nenhum teste alterado.

## Escopo deste documento

- documento estritamente operacional e documental;
- sem alteração funcional;
- sem alteração de testes;
- sem proposta de patch imediato;
- sem ativação de flags;
- sem preparação para PostgreSQL.