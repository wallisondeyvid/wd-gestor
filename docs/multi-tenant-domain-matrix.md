# Matriz de Domínios Multi-tenant — WD Gestor

## Contexto

- WD Gestor, neste documento, significa a aplicação inteira, e não apenas o módulo Gestor.
- A infraestrutura tenant-aware já existe no código atual, ancorada em `unitScope`, `resolveConnection` e `resolveModel`.
- A adoção dessa infraestrutura ainda é desigual entre módulos e domínios, com convivência entre corredores tenant-aware, globais legítimos e compatibilidades legadas.
- O objetivo desta matriz é orientar a próxima fase macro da migração multi-tenant antes de qualquer preparação para PostgreSQL.
- Este documento é operacional e não propõe patch funcional, ativação de flags ou microcorte isolado.

## Matriz de domínios

| Domínio | Classificação | Fonte atual provável de escopo | Dependência de unitScope | Dependência de sessão legacy | Uso de resolveModel/resolveConnection | Riscos principais | Checkpoints e testes próximos |
| --- | --- | --- | --- | --- | --- | --- | --- |
| usuários | híbrido | auth-context, `global_role`, projeção em `req.session.user`, memberships em transição | parcial | alta | parcial, via facades e DB legada | identidade global ainda convive com autorização contextual híbrida | `docs/gestor-auth-context-phase3-spec.md`; `docs/checkpoints/gestor-tenant-enforcement-usuarios-administrativos-decima-quinta-fatia-macro.md`; `tests/gestor-usuarios-admin-runtime-contract.test.js` |
| user memberships | compat legado temporário | coleção `user_memberships` já provisionada, mas ainda não é fonte plena do runtime | não no fluxo legado principal | média | previsto como base futura | coleção existe sem ter virado fonte canônica do runtime | `docs/runbooks/user-memberships-phase2-backfill.md` |
| unidades | híbrido | contexto ativo, cluster canônico, lookups administrativos globais | parcial | média | sim | unidade é ao mesmo tempo tenant base e catálogo administrativo | `docs/gestor-provisioning-contract.md`; `tests/gestor-api-unidades-cluster-runtime-contract.test.js` |
| módulos | global legítimo | catálogo global e gates por auth-context | baixa para catálogo, média para autorização | média | sim | risco de confundir catálogo global com autorização contextual | `docs/gestor-auth-context-phase3-spec.md`; `tests/gestor-registry-wrapper-parity.test.js` |
| funções | tenant por unidade | `req.unitScope`, `scopedUnitId`, policies locais | sim | baixa a média | sim | resíduos de compatibilidade em ramos privilegiados | checkpoints da família Função em `docs/migration-status.md` |
| setores | híbrido | contexto canônico e wrappers já endurecidos | sim nos corredores drenados | média | sim | hotspot restante é grande demais para corte local seguro | `docs/checkpoints/setores-read-audit-no-safe-microstep.md` |
| recursos | tenant por unidade | `req.unitScope` e filtros por unidade | sim | baixa a média | sim | duplicidade estrutural residual, sobretudo no eixo Escalas | checkpoints de Recursos em `docs/migration-status.md`; `docs/checkpoints/escalas-fase-maior-recursos-lista-congelamento-local.md` |
| funcionários | híbrido | fluxo contextual por `req.unitScope`; ramo global explícito para master/admin | sim no contextual | média | sim | leitura global legítima já existe, mas ações seguem estritamente contextuais | `docs/migration-status.md`; `tests/gestor-funcionarios-get-by-id-runtime-contract.test.js` |
| feedback/widgets | híbrido | widget canônico usa `requireUnitScope`; administração usa seed de scope por auth-context | sim em vários corredores | média | sim, com bridge legado | coexistem writes contextuais, aliases e compatibilidades legadas | `docs/checkpoints/gestor-feedback-create-runtime-contract.md`; `docs/checkpoints/gestor-feedback-list-runtime-contract.md`; `docs/checkpoints/gestor-feedback-upload-runtime-contract.md`; `docs/checkpoints/gestor-feedback-delete-runtime-contract.md` |
| condomínios | híbrido | wrapper do módulo, `req.unitScope` no V2 e compatibilidade V1/V2 | sim no corredor V2 | baixa | sim | fallback residual e bifurcação V1/V2 ainda impedem consolidação final | `docs/checkpoints/condominios-congelamento-conservador-snapshot-atual.md`; `tests/condominios.v2.parity.test.js`; `tests/condominios.v2.parity.matrix.test.js` |
| unidades condominiais | tenant por unidade | `req.unitScope` e repositórios escopados | sim | baixa | sim | ainda dependem da estabilização semântica do corredor V2 | `docs/migration-status.md` |
| blocos | tenant por unidade | `requireUnitScope` e `req.unitScope` | sim | baixa | sim | risco baixo no corredor alinhado; risco sobe ao reabrir compatibilidades amplas | `docs/migration-status.md`; `tests/condominios.blocos.microcut.test.js` |
| andares | tenant por unidade | `requireUnitScope` e `req.unitScope` | sim | baixa | sim | risco semelhante ao de blocos no corredor já alinhado | `docs/migration-status.md`; `tests/condominios.requireUnitScope.test.js` |
| assembleias | decisão funcional pendente | contexto de execução V2 e autenticação mínima local | parcial | baixa | sim em corredores V2 | superfície de write e presença ainda sem matriz semântica fechada | `docs/checkpoints/assembleias-execution-presence-context-runtime-contract.md`; `tests/assembleias-execution-presence-context-runtime-contract.test.js` |
| comunicados | híbrido | seams locais já auditadas em GETs específicos | parcial | baixa | provável | risco de extrapolar para publicação, PDF, relatórios e buscas largas sem classificação prévia | `docs/checkpoints/condominios-congelamento-conservador-snapshot-atual.md`; `memories/repo/comunicados-by-id-guardrail.md` |
| enquetes | híbrido | seams locais já auditadas em GETs específicos | parcial | baixa | provável | risco de abrir votos, detalhamento amplo e writes sem matriz semântica | `docs/checkpoints/condominios-congelamento-conservador-snapshot-atual.md`; `memories/repo/enquetes-detalhes-guardrail.md` |
| materiais | híbrido | contexto do módulo e famílias específicas | parcial | baixa | provável | subdomínios múltiplos ainda não consolidados em uma única classificação canônica | checkpoints e guardrails de Materiais no módulo Condomínios |
| escalas | híbrido | corredores locais por unidade, sem canonicidade transversal fechada | parcial | média | parcial | próximos passos já saem do microcorte e entram em fase estrutural | `docs/migration-status.md`; checkpoints de Escalas em `docs/checkpoints/` |
| ausências | híbrido | unidade e filtros locais do handler | parcial | média | parcial | endpoint congelado localmente, mas sem matriz de domínio fechada | `docs/checkpoints/escalas-fase-maior-ausencias-congelamento-local.md` |
| férias | decisão funcional pendente | provável contexto por unidade e pages | incerto | média | incerto | ainda não há corredor pequeno nem semântica consolidada | `docs/migration-status.md` |
| disponibilidade | decisão funcional pendente | fase maior em Escalas | incerto | média | incerto | já exige frente estrutural, não ajuste local | checkpoints de disponibilidade em Escalas |
| clínica | compat legado temporário | módulo estável, sem frente tenant ativa evidente | baixa no snapshot atual | média | não evidenciado de forma relevante nesta rodada | abrir a frente agora tende a ser artificial | `docs/clinica-route-contract.md`; `docs/migration-status.md` |
| portal/morador | híbrido | contexto do usuário portal, `req.unitScope`, `req.ctx.unitScope` | sim | média | sim | reabertura ampla pode acoplar novamente auth do portal ao Gestor sem necessidade | `docs/checkpoints/gestor-generic-public-auth-structural-seam-runtime-contract.md`; `src/modules/portal-morador/app/repositories/PortalAuthRepository.js` |
| visitas | tenant por unidade | habitação resolvida por query ou contexto do usuário | parcial | média | provável | não pode ampliar leitura para a unidade inteira sem decisão explícita | `memories/repo/portal-morador-visitas-historico-acessos-guardrail.md` |
| configurações globais | global legítimo | coleções e settings globais | baixa | baixa | sim em alguns serviços | risco de confundir configuração global com autorização global | `docs/gestor-provisioning-contract.md`; `memories/repo/widget-settings-guardrails.md` |
| logs/auditoria | híbrido | parte global de auditoria, parte contextual por unidade | parcial | baixa | sim em vários pontos | falta separar formalmente auditoria global de auditoria contextual | `docs/gestor-provisioning-contract.md`; checkpoints de runtime por família |
| arquivos/anexos/fotos | compat legado temporário | unidade ativa, ownership e storage compatível | parcial | média | parcial | alguns corredores ainda aceitam compatibilidade legacy controlada | `docs/checkpoints/gestor-feedback-upload-runtime-contract.md`; testes de anexos e fotos de funcionários |

## Fallbacks aceitos

- visão global explícita para master/admin quando o produto já consolidou esse comportamento como legítimo, especialmente em leitura administrativa;
- catálogos administrativos globais que não representam contexto operacional de unidade;
- sessão autenticada global ou seleção pendente quando prevista pelo auth-context, sem inventar unidade ativa artificialmente;
- `global scope` quando o enforcement multi-tenant está desligado, como compatibilidade de runtime e transição;
- compatibilidade V1/V2 de Condomínios enquanto a bifurcação ainda existir como estado de transição explicitamente conhecido;
- uploads e leituras legacy explicitamente controlados, quando o corredor já documenta a compatibilidade e não a usa para ampliar autorização.

## Fallbacks perigosos

- `req.user.unidade_id` usado como fonte material concorrente ao contexto canônico;
- `req.session.user.unidade_id` funcionando como autorização real, e não apenas como projeção de compatibilidade;
- `GLOBAL_SCOPE` difuso em `api.db.js` e `auth.db.js`, sem distinção nítida entre global legítimo e global de conveniência;
- ausência de `unitScope` tratada automaticamente como global legítimo em domínio operacional sensível;
- writes sem contexto canônico de unidade ou sem exceção global legítima explicitamente documentada;
- expansão de visitas, comunicados, enquetes ou assembleias sem matriz semântica fechada para o domínio correspondente.

## Lacunas atuais

- `user_memberships` ainda não é fonte plena do runtime;
- `auth-context` ainda está em transição e convive com projeções legadas em sessão;
- `api.db.js` e `auth.db.js` ainda concentram resíduos heterogêneos demais para rollout mais amplo;
- Condomínios ainda opera com V1/V2 e compatibilidade residual no snapshot atual;
- Escalas ainda não possui matriz semântica fechada por domínio;
- Portal do Morador ainda depende de auth e contexto sensíveis, o que impede reabertura automática da frente;
- ainda falta inventário explícito das feature flags relevantes por domínio e por superfície de risco.

## Critérios de pronto para a próxima fase

- todos os domínios críticos classificados nesta matriz ou em revisão documental controlada;
- globais legítimos listados explicitamente por domínio;
- fallbacks perigosos inventariados e tratados como dívida conhecida, não como comportamento neutro;
- `auth-context` delimitado como fonte canônica versus projeção de compatibilidade;
- `user_memberships` posicionado com clareza como fonte futura do vínculo contextual;
- feature flags catalogadas com escopo, impacto e rollback conhecidos;
- testes de paridade, runtime-contract e watchdog permanecendo verdes como linha de base.

## Recomendação operacional

- a próxima fase macro deve ser a consolidação semântica e operacional do `auth-context` e dos domínios híbridos do Gestor, antes de qualquer ativação mais ampla de flags;
- a ordem recomendada continua sendo: fechar a matriz semântica, delimitar auth e memberships, e só então planejar rollout controlado de runtime;
- PostgreSQL permanece fora até que a matriz canônica esteja fechada e que os domínios híbridos críticos tenham fronteiras operacionais suficientemente estáveis.

## Escopo deste documento

- documento estritamente operacional e documental;
- sem alteração de código;
- sem alteração de testes;
- sem proposta de microcorte isolado;
- sem início de preparação para PostgreSQL nesta etapa.