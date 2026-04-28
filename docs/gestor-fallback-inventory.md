# Inventário de Fallbacks do Gestor

## Contexto

- WD Gestor significa a aplicação inteira, mas este inventário foca apenas no módulo Gestor.
- A Fase A consolidou a matriz inicial em `docs/multi-tenant-domain-matrix.md`.
- A Fase B foi planejada em `docs/tenant-phase-b-auth-context-plan.md`.
- O primeiro artefato operacional da Fase B foi consolidado em `docs/gestor-operational-auth-context-model.md`.
- Este documento inventaria os fallbacks ainda presentes, aceitos ou observados no Gestor, classificando cada um com destino explícito.
- O objetivo aqui é semântico e operacional. Não há proposta de patch funcional, não há mudança de testes, não há ativação de flags e não há preparação para PostgreSQL.

## Objetivo

Registrar, por categoria, os principais fallbacks do Gestor e responder para cada um:

1. o que ele faz;
2. onde ele aparece ou qual família afeta;
3. qual a sua classificação operacional;
4. qual o risco atual;
5. qual o destino futuro esperado;
6. quais testes e checkpoints próximos congelam ou cercam esse comportamento.

## Classificações usadas

| Classificação | Significado operacional |
| --- | --- |
| remover | fallback não deve permanecer no estado-alvo |
| documentar | comportamento deve permanecer apenas como regra explícita, sem ambiguidade |
| manter temporariamente | compatibilidade ainda aceita enquanto o corredor não migra por completo |
| global legítimo | não é dívida; é ramo global funcionalmente aceito |
| substituir por auth-context | a fonte correta futura deve ser o auth-context canônico |
| substituir por user_memberships | a fonte correta futura deve ser o vínculo por unidade em `user_memberships` |
| substituir por req.unitScope | a fonte correta futura deve ser o escopo operacional efetivo da requisição |

## Inventário por categoria

### 1. `req.session.user`

| Campo | Registro |
| --- | --- |
| descrição | Projeção legada de sessão usada para manter compatibilidade com guards, owners e endpoints ainda não totalmente migrados para o modelo canônico. |
| onde aparece ou família afeta | Auth auxiliar, `GET /gestor/api/usuario`, `GET /gestor/api/modulos`, pages do Gestor, cluster de unidades e partes do wiring legado. |
| classificação | manter temporariamente; documentar; substituir por auth-context |
| risco | médio; quando tratado como fonte material de autorização, reintroduz ambiguidade entre sessão projetada e contexto canônico. |
| destino futuro | Permanecer apenas como projeção derivada de `req.session.gestorAuthContext`, sem status de fonte autoritativa. |
| testes e checkpoints próximos | `tests/gestor-auth-user-endpoint-runtime-contract.test.js`; `tests/gestor-auth-user-endpoint-context.test.js`; `docs/checkpoints/gestor-auth-user-endpoint-runtime-contract.md`; `docs/checkpoints/gestor-auth-context-get-runtime-contract.md` |

### 2. `req.session.user.unidade_id`

| Campo | Registro |
| --- | --- |
| descrição | Projeção histórica da unidade em sessão, ainda útil para corredores legados, mas semanticamente inadequada como autorização real. |
| onde aparece ou família afeta | Sessão autenticada do Gestor, pages contextuais, rotas protegidas legadas, cluster, usuário atual e partes do login pós-auth. |
| classificação | remover; manter temporariamente; substituir por auth-context; substituir por req.unitScope |
| risco | alto; se virar fonte de autorização tenant-sensitive, concorre com `active_unidade_id` e com `req.unitScope`. |
| destino futuro | Ficar somente como projeção refletindo contexto ativo já resolvido, sem poder autorizar writes, detalhes ou leituras contextuais por conta própria. |
| testes e checkpoints próximos | `tests/gestor-api-unidades-cluster-runtime-contract.test.js`; `docs/checkpoints/gestor-api-unidades-cluster-runtime-contract.md`; `docs/checkpoints/gestor-auth-login-first-authenticated-request-runtime-contract.md`; `docs/checkpoints/gestor-auth-context-get-runtime-contract.md` |

### 3. `req.user.unidade_id`

| Campo | Registro |
| --- | --- |
| descrição | Unidade derivada na reidratação de `req.user`, usada por guards e owners legados como atalho de contexto. |
| onde aparece ou família afeta | Guards de login e role, owners legados do Gestor, módulos auxiliares, páginas contextuais e partes da família de usuários administrativos. |
| classificação | remover; substituir por auth-context; substituir por req.unitScope |
| risco | alto; é o fallback concorrente mais perigoso, porque parece canônico no request mas pode nascer de projeção stale ou de reidratação parcial. |
| destino futuro | Deixar de ser fonte material concorrente e sobreviver, quando necessário, só como reflexo do contexto já resolvido. |
| testes e checkpoints próximos | `docs/migration-status.md`; `docs/checkpoints/gestor-api-unidades-cluster-runtime-contract.md`; `docs/checkpoints/gestor-auth-modulos-canonical-result-data-facade-decima-sexta-fatia-macro.md`; `docs/checkpoints/gestor-tenant-enforcement-usuarios-administrativos-decima-quinta-fatia-macro.md` |

### 4. `active_unidade_id`

| Campo | Registro |
| --- | --- |
| descrição | Campo canônico do auth-context para representar a unidade ativa escolhida pelo usuário contextual. Não é fallback ruim por si só, mas precisa ser protegido contra uso indevido como autorização autossuficiente. |
| onde aparece ou família afeta | Auth-context, seleção de unidade, troca de unidade, cluster, pages contextuais, leitura de contexto autenticado e projeção em sessão. |
| classificação | documentar; manter temporariamente; substituir por req.unitScope quando a borda já for contextual |
| risco | médio; o risco está em tratá-lo como autorização suficiente fora da borda contextual ou em preenchê-lo artificialmente para evitar bloqueios. |
| destino futuro | Permanecer como estado canônico de contexto ativo no auth-context; nas rotas tenant-sensitive, o efeito operacional deve chegar via `req.unitScope`. |
| testes e checkpoints próximos | `tests/gestor-auth-context-select-unit-runtime-contract.test.js`; `tests/gestor-auth-context-switch-unit-runtime-contract.test.js`; `docs/checkpoints/gestor-auth-context-select-unit-runtime-contract.md`; `docs/checkpoints/gestor-auth-context-switch-unit-runtime-contract.md`; `docs/checkpoints/gestor-auth-context-get-runtime-contract.md` |

### 5. `GLOBAL_SCOPE` em `api.db.js`

| Campo | Registro |
| --- | --- |
| descrição | Escopo global usado na bridge de leitura e em helpers legados quando o tenant não está resolvido de forma explícita. |
| onde aparece ou família afeta | Bridge do Gestor, leituras auxiliares de unidades, cluster, setores, lookups administrativos e helpers antigos em `api.db.js`. |
| classificação | remover; documentar; manter temporariamente; substituir por req.unitScope |
| risco | alto; quando difuso, mascara ausência de escopo canônico e mistura catálogo global legítimo com conveniência técnica. |
| destino futuro | Restringir o uso a ramos globais legítimos explicitamente listados; onde houver operação contextual, resolver escopo por `req.unitScope` ou por lookup canônico inequívoco. |
| testes e checkpoints próximos | `docs/checkpoints/bridge-subfase-1.md`; `docs/checkpoints/bridge-subfase-2.md`; `tests/gestor-unidades-unit-scope-canonical.test.js`; `tests/gestor-unidades-writes-misc-unit-scope-canonical.test.js`; `tests/gestor-funcionarios-funcoes-unit-scope-canonical.test.js` |

### 6. `GLOBAL_SCOPE` em `auth.db.js`

| Campo | Registro |
| --- | --- |
| descrição | Escopo global adotado pelo auth legado para carregar identidade, reset, remember token e partes híbridas de usuário e funcionário. |
| onde aparece ou família afeta | Login, recuperação de senha, primeiro acesso, remember-me, lockout, leitura de usuário por e-mail e partes híbridas do auth do Gestor. |
| classificação | documentar; manter temporariamente; global legítimo em parte; substituir por auth-context |
| risco | médio-alto; há componentes globalmente legítimos no auth, mas o uso amplo também preserva ambiguidade em superfícies híbridas. |
| destino futuro | Conservar o que é identidade global e fluxos globais legítimos; restringir o restante a contexto explícito sem big-bang em `auth.db.js`. |
| testes e checkpoints próximos | `docs/checkpoints/gestor-auth-login-pre-auth-gate-data-facade-vigesima-segunda-fatia-macro.md`; `docs/checkpoints/gestor-auth-recovery-request-json-data-facade-vigesima-fatia-macro.md`; `docs/checkpoints/gestor-auth-recovery-reset-token-data-facade-vigesima-primeira-fatia-macro.md`; `docs/checkpoints/gestor-auth-primeiro-acesso-data-facade-decima-oitava-fatia-macro.md`; `docs/checkpoints/gestor-auth-login-post-auth-runtime-contract.md` |

### 7. seleção pendente

| Campo | Registro |
| --- | --- |
| descrição | Estado autenticado sem unidade ativa para usuários com múltiplos vínculos, exigindo escolha explícita antes da operação contextual. |
| onde aparece ou família afeta | Login pós-auth, `GET /gestor/auth/context`, `POST /gestor/auth/select-unit`, `POST /gestor/auth/switch-unit`, `GET /gestor/api/usuario`, `GET /gestor/api/modulos` e guards auxiliares. |
| classificação | manter temporariamente; documentar; substituir por user_memberships |
| risco | baixo-médio; o estado é correto, mas vira risco quando algum corredor tenta contorná-lo inventando unidade ativa. |
| destino futuro | Permanecer como estado legítimo do auth-context enquanto o produto suportar múltiplos vínculos; nunca ser convertido em contexto artificial silencioso. |
| testes e checkpoints próximos | `tests/gestor-auth-context-select-unit-runtime-contract.test.js`; `tests/gestor-auth-context-switch-unit-runtime-contract.test.js`; `tests/gestor-auth-context-get-runtime-contract.test.js`; `docs/checkpoints/gestor-auth-context-select-unit-runtime-contract.md`; `docs/checkpoints/gestor-auth-context-switch-unit-runtime-contract.md`; `docs/checkpoints/gestor-auth-user-endpoint-runtime-contract.md` |

### 8. catálogos administrativos globais

| Campo | Registro |
| --- | --- |
| descrição | Leituras globais de módulos, partes administrativas de unidades e catálogos que não representam operação contextual por unidade. |
| onde aparece ou família afeta | Módulos, provisioning, partes administrativas de unidades, settings globais e alguns lookups de apoio do Gestor. |
| classificação | global legítimo; documentar |
| risco | baixo; o risco real é apenas classificá-los errado como fallback perigoso ou usá-los para ampliar autorização contextual. |
| destino futuro | Permanecer explicitamente listados como globais legítimos, separados de qualquer regra contextual tenant-sensitive. |
| testes e checkpoints próximos | `docs/gestor-operational-auth-context-model.md`; `docs/gestor-provisioning-contract.md`; `docs/checkpoints/gestor-auth-modulos-canonical-result-data-facade-decima-sexta-fatia-macro.md`; `tests/gestor-registry-wrapper-parity.test.js` |

### 9. master/admin global

| Campo | Registro |
| --- | --- |
| descrição | Ramo privilegiado global para identidades com `global_role=master` ou `global_role=admin`, inclusive quando não há unidade ativa selecionada. |
| onde aparece ou família afeta | Login, auth-context, `GET /gestor/api/modulos`, `GET /gestor/api/usuario`, `GET /gestor/api/unidades/cluster`, `GET /gestor/funcionarios` e superfícies administrativas globais. |
| classificação | global legítimo; documentar |
| risco | médio se escapar do escopo de consulta e catálogo; baixo quando explicitamente documentado e separado de ações contextuais. |
| destino futuro | Permanecer como ramo global legítimo e explicitamente delimitado; sem virar autorização implícita para writes contextuais. |
| testes e checkpoints próximos | `docs/migration-status.md`; `docs/checkpoints/gestor-api-unidades-cluster-runtime-contract.md`; `docs/checkpoints/gestor-auth-context-get-runtime-contract.md`; `tests/gestor-api-unidades-cluster-runtime-contract.test.js`; checkpoint documental de `GET /gestor/funcionarios` em `docs/migration-status.md` |

### 10. compat de feedback/upload

| Campo | Registro |
| --- | --- |
| descrição | Compatibilidades residuais de feedback e upload, com coexistência entre widget canônico, bridge legada e envelopes históricos de erro ou sucesso. |
| onde aparece ou família afeta | Feedback create, list, detail, delete, upload, resposta e settings de widget no Gestor. |
| classificação | manter temporariamente; documentar; substituir por req.unitScope; compat de bridge/facade em transição |
| risco | médio-alto; uploads e writes são superfícies sensíveis porque podem ampliar escopo fora da unidade contextual correta ou quebrar contratos HTTP congelados. |
| destino futuro | Concentrar o contexto efetivo em `req.unitScope` e manter a compatibilidade restante apenas como camada fina de transição, sem ampliar autorização. |
| testes e checkpoints próximos | `docs/checkpoints/gestor-feedback-create-runtime-contract.md`; `docs/checkpoints/gestor-feedback-list-runtime-contract.md`; `docs/checkpoints/gestor-feedback-detail-runtime-contract.md`; `docs/checkpoints/gestor-feedback-delete-runtime-contract.md`; `docs/checkpoints/gestor-feedback-upload-runtime-contract.md`; `tests/architecture/widget-settings-api-route-delegation-only.test.js` |

### 11. compat de páginas antigas

| Campo | Registro |
| --- | --- |
| descrição | Compatibilidade mantida em pages do Gestor que ainda convivem com projeção legada de sessão, owner antigo e transição para modo context-first. |
| onde aparece ou família afeta | Páginas de funcionários, usuários administrativos, unidades e outras páginas do Gestor já migradas parcialmente para auth-context. |
| classificação | manter temporariamente; documentar; substituir por auth-context; substituir por req.unitScope |
| risco | médio; páginas antigas tendem a esconder fallback concorrente por sessão e a misturar catálogo global com operação contextual. |
| destino futuro | Fechar pages em modo context-first, com cluster permitido e unidade efetiva resolvidos de forma canônica, deixando a compatibilidade apenas na projeção mínima necessária. |
| testes e checkpoints próximos | `docs/migration-status.md`; `docs/checkpoints/gestor-tenant-enforcement-usuarios-administrativos-decima-quinta-fatia-macro.md`; `docs/checkpoints/gestor-api-unidades-cluster-runtime-contract.md`; suites focais de pages já citadas em `docs/migration-status.md` |

### 12. compat de bridge/facades

| Campo | Registro |
| --- | --- |
| descrição | Ponte estrutural entre owners, services, facades e `api.db.js` ou `auth.db.js`, preservada para evitar big-bang enquanto os corredores são drenados um a um. |
| onde aparece ou família afeta | Leituras de cluster, unidades, setores, auth-context resolver, login pre-auth, recovery, primeiro acesso, módulos e outros subcorredores reroteados para data facades. |
| classificação | manter temporariamente; documentar; remover; substituir por auth-context; substituir por req.unitScope |
| risco | médio; a bridge é aceitável como costura transitória, mas se ficar sem inventário vira esconderijo de escopo global difuso e fallback opaco. |
| destino futuro | Reduzir helper por helper e corredor por corredor, preservando apenas a delegação compat mínima enquanto os donos canônicos assumem a leitura contextual ou global legítima. |
| testes e checkpoints próximos | `docs/checkpoints/bridge-subfase-1.md`; `docs/checkpoints/bridge-subfase-2.md`; `docs/checkpoints/gestor-auth-context-read-data-facade-decima-quinta-fatia-macro.md`; `docs/checkpoints/gestor-auth-login-pre-auth-gate-data-facade-vigesima-segunda-fatia-macro.md`; `docs/checkpoints/gestor-auth-modulos-canonical-result-data-facade-decima-sexta-fatia-macro.md` |

## Fallbacks permitidos

| Fallback ou grupo | Motivo operacional |
| --- | --- |
| catálogos administrativos globais | são globais legítimos e não devem ser confundidos com operação contextual |
| master/admin global | privilégio global legítimo já consolidado para consulta e catálogos explicitamente documentados |
| seleção pendente | estado correto do auth-context quando há múltiplos vínculos e nenhuma unidade ativa escolhida |
| `active_unidade_id` | estado canônico de contexto ativo, desde que não seja tratado como autorização autossuficiente |
| `req.session.user` como projeção | aceitável apenas como compatibilidade transitória, nunca como fonte primária de autorização |
| parte global de `GLOBAL_SCOPE` em `auth.db.js` | ainda legítima para identidade global, credenciais, reset e remember token |

## Fallbacks proibidos

| Fallback ou grupo | Motivo operacional |
| --- | --- |
| `req.user.unidade_id` como fonte material concorrente | concorre diretamente com o auth-context e com `req.unitScope` |
| `req.session.user.unidade_id` como autorização real | transforma projeção legado em fonte material de decisão tenant-sensitive |
| `GLOBAL_SCOPE` difuso em operação contextual | mascara ausência de escopo resolvido e mistura global legítimo com conveniência técnica |
| criação artificial de contexto ativo | burla a seleção pendente e destrói a semântica de múltiplos vínculos |
| write contextual sem `req.unitScope` canônico | amplia risco de vazamento de tenant e de autorização indevida |

## Fallbacks temporários

| Fallback ou grupo | Condição para continuar existindo |
| --- | --- |
| `req.session.user` | somente enquanto ainda houver corredores legados consumindo projeção de sessão |
| `req.session.user.unidade_id` | somente como reflexo do contexto ativo já resolvido |
| parte híbrida de `GLOBAL_SCOPE` em `api.db.js` | somente enquanto helpers ainda não forem drenados para escopo canônico ou ramo global explícito |
| parte híbrida de `GLOBAL_SCOPE` em `auth.db.js` | somente enquanto o auth legado ainda não estiver semanticamente segmentado |
| compat de feedback/upload | somente enquanto as superfícies de feedback ainda exigirem bridge e congelamento de contrato legado |
| compat de páginas antigas | somente enquanto as páginas ainda não operarem integralmente em modo context-first |
| compat de bridge/facades | somente enquanto a drenagem helper por helper e corredor por corredor ainda estiver em curso |

## Leitura operacional do inventário

- Nem todo fallback é dívida do mesmo tipo.
- Há quatro grupos distintos no Gestor atual:
  - globais legítimos que devem permanecer explicitamente documentados;
  - compatibilidades temporárias que ainda podem existir com cerca operacional;
  - projeções legadas que não podem continuar como fonte material de autorização;
  - resíduos de bridge e de escopo global que precisam de redução progressiva, não de big-bang.
- O principal eixo de convergência continua sendo:
  - `auth-context` para identidade autenticada, seleção pendente e contexto ativo;
  - `user_memberships` para vínculo por unidade;
  - `req.unitScope` para operação contextual efetiva.

## Critérios de pronto deste artefato

- documento criado;
- fallbacks inventariados por categoria;
- classificação explícita por item;
- risco e destino futuro registrados;
- checkpoints e testes próximos listados;
- separação entre permitidos, proibidos e temporários;
- nenhum código alterado;
- nenhum teste alterado.

## Escopo deste documento

- documento estritamente operacional e documental;
- sem alteração funcional;
- sem alteração de testes;
- sem proposta de patch imediato;
- sem ativação de flags;
- sem preparação para PostgreSQL.