# Fase U - Contrato de Escopo para Preparacao Operacional Concreta Manual Controlada Sintetica

## 1. Status

- Aberta.

## 2. Natureza da fase

Registrar que a Fase U e documental, preventiva, nao produtiva, sintetica, nao executiva e nao operacional por padrao.

Registrar que a Fase U existe para definir o escopo exato de uma eventual preparacao operacional concreta manual controlada sintetica futura.

Registrar que a abertura da Fase U nao autoriza preparacao operacional concreta, execucao, rollback real, evidencia operacional real, caller real, rota, CLI, script, job, bootstrap, request path, registry real, allowlist real, roteamento real, tenant DB real, Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

## 3. Origem

Registrar que a Fase U nasce apos a Fase T ter sido encerrada, validada, publicada e auditada pos-publicacao.

Registrar como base:

- 2bcd266 docs(tenant): completa validacao final da fase t.

Registrar que a Fase T deixou documentado que qualquer preparacao operacional concreta futura exigiria fase posterior propria, autorizacao explicita propria do usuario, comando proprio aprovado pelo usuario, escopo delimitado, rollback definido, evidencias definidas, gates verdes, validacao anterior e posterior, mantendo todos os bloqueios ativos ate la.

## 4. Objetivo

Registrar que o objetivo da Fase U e construir o contrato documental de escopo para uma eventual preparacao operacional concreta manual controlada sintetica.

Registrar que a Fase U devera separar obrigatoriamente:

- escopo documental;
- autorizacao explicita;
- preparacao operacional concreta;
- execucao;
- rollback real;
- evidencia operacional real;
- superficie operacional;
- publicacao;
- fase posterior.

Registrar que nenhum desses itens pode ser presumido a partir da abertura da Fase U.

## 5. Escopo permitido nesta abertura

Registrar que nesta abertura da Fase U e permitido apenas:

- criar este contrato documental;
- registrar o status inicial da fase;
- registrar a origem na Fase T;
- registrar os gates iniciais;
- registrar os bloqueios iniciais;
- registrar o criterio de avanco documental inicial;
- atualizar o ledger global docs/migration-status.md com a abertura da Fase U.

Registrar que nada operacional pode ser criado ou executado nesta abertura.

## 6. Gates iniciais da Fase U

Registrar:

- operationalPreparationScopeContractOpened=true
- operationalPreparationScopeDefined=true
- operationalPreparationBoundariesDefined=false
- operationalPreparationInputsDefined=false
- operationalPreparationOutputsDefined=false
- operationalPreparationExclusionsDefined=false
- operationalPreparationChecklistApplied=false
- operationalPreparationConcreteStillForbidden=true
- executionStillForbidden=true
- rollbackStillForbidden=true
- operationalEvidenceStillForbidden=true
- operationalSurfaceStillForbidden=true
- candidateStillSynthetic=true
- nonProductionRequired=true
- explicitAuthorizationStillRequired=true
- commandApprovalStillRequired=true
- fallbackRequired=true
- blockedReasons=[]

Explicar:

- operationalPreparationScopeContractOpened=true porque a Fase U foi aberta documentalmente.
- operationalPreparationScopeDefined=true porque o escopo documental foi definido, sem autorizacao concreta, sem preparacao operacional concreta, sem execucao, sem rollback real e sem coleta de evidencia operacional real.
- operationalPreparationBoundariesDefined=false porque as fronteiras ainda nao foram definidas.
- operationalPreparationInputsDefined=false porque as entradas ainda nao foram definidas.
- operationalPreparationOutputsDefined=false porque as saidas ainda nao foram definidas.
- operationalPreparationExclusionsDefined=false porque as exclusoes ainda nao foram definidas.
- operationalPreparationChecklistApplied=false porque o checklist ainda nao foi aplicado.
- operationalPreparationConcreteStillForbidden=true porque nenhuma preparacao operacional concreta e permitida nesta abertura.
- executionStillForbidden=true porque nenhuma execucao e permitida nesta fase por padrao.
- rollbackStillForbidden=true porque nenhum rollback real e permitido nesta fase por padrao.
- operationalEvidenceStillForbidden=true porque nenhuma evidencia operacional real pode ser coletada nesta abertura.
- operationalSurfaceStillForbidden=true porque nenhuma superficie operacional pode ser criada nesta abertura.
- candidateStillSynthetic=true porque qualquer candidato permanece obrigatoriamente sintetico.
- nonProductionRequired=true porque qualquer preparacao futura, se um dia autorizada, devera permanecer nao produtiva.
- explicitAuthorizationStillRequired=true porque a Fase U nao substitui autorizacao explicita propria do usuario.
- commandApprovalStillRequired=true porque qualquer comando futuro continua exigindo aprovacao propria do usuario.
- fallbackRequired=true porque fallback para baseConnection permanece obrigatorio.
- blockedReasons=[] porque nao ha bloqueio documental para abrir a fase; ha apenas trabalho documental pendente para completar o contrato de escopo.

## 7. Escopo documental da preparacao operacional concreta futura

Registrar que o escopo definido e exclusivamente documental e nao autoriza preparacao operacional concreta.

Registrar que o escopo da preparacao operacional concreta futura, se um dia autorizada em fase posterior propria, devera se limitar a:

- candidato sintetico previamente documentado;
- ambiente nao produtivo;
- banco sintetico descartavel;
- ausencia de Portal;
- ausencia de dados reais;
- ausencia de trafego real;
- ausencia de usuario real;
- ausencia de unidade real;
- PostgreSQL fora de escopo;
- manutencao obrigatoria do fallback para baseConnection;
- preparacao manual controlada;
- comando proprio aprovado pelo usuario em momento posterior;
- autorizacao explicita propria do usuario em momento posterior;
- evidencias documentais antes e depois;
- validacao anterior e posterior;
- rollback definido antes de qualquer preparacao concreta;
- bloqueio imediato se qualquer condicao deixar de ser sintetica, nao produtiva, manual ou controlada.

Registrar explicitamente que o escopo NAO inclui:

- execucao;
- rollback real;
- coleta de evidencia operacional real neste microcorte;
- criacao de superficie operacional;
- caller real;
- rota;
- CLI;
- script;
- job;
- bootstrap;
- request path;
- registry real;
- allowlist real;
- roteamento real;
- tenant DB real;
- Portal;
- dados reais;
- trafego real;
- usuario real;
- unidade real;
- PostgreSQL;
- alteracao de codigo;
- alteracao de testes;
- alteracao de package.json;
- alteracao de src.

Registrar:

- operationalPreparationScopeContractOpened=true
- operationalPreparationScopeDefined=true
- operationalPreparationBoundariesDefined=false
- operationalPreparationInputsDefined=false
- operationalPreparationOutputsDefined=false
- operationalPreparationExclusionsDefined=false
- operationalPreparationChecklistApplied=false
- operationalPreparationConcreteStillForbidden=true
- executionStillForbidden=true
- rollbackStillForbidden=true
- operationalEvidenceStillForbidden=true
- operationalSurfaceStillForbidden=true
- candidateStillSynthetic=true
- nonProductionRequired=true
- explicitAuthorizationStillRequired=true
- commandApprovalStillRequired=true
- fallbackRequired=true
- blockedReasons=[]

Interpretacao obrigatoria:

- escopo documental definido nao autoriza preparacao operacional concreta;
- escopo documental definido nao autoriza execucao;
- escopo documental definido nao autoriza rollback real;
- escopo documental definido nao autoriza coleta de evidencia operacional real;
- escopo documental definido nao autoriza criacao de superficie operacional;
- escopo documental definido nao autoriza caller real, rota, CLI, script, job, bootstrap ou request path;
- escopo documental definido nao autoriza alteracao de registry real, allowlist real, tenant DB real ou roteamento real;
- escopo documental definido nao autoriza Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL;
- escopo documental definido nao autoriza push.

## 8. Bloqueios obrigatorios nesta abertura

Registrar que a abertura da Fase U bloqueia expressamente:

- preparacao operacional concreta;
- execucao;
- rollback real;
- evidencia operacional real;
- caller real;
- rota;
- CLI;
- script;
- job;
- bootstrap;
- request path;
- registry real;
- allowlist real;
- roteamento real;
- tenant DB real;
- Portal;
- dados reais;
- trafego real;
- usuario real;
- unidade real;
- PostgreSQL;
- qualquer acoplamento em codigo produtivo;
- qualquer alteracao em package.json;
- qualquer alteracao em testes;
- qualquer alteracao em src.

## 9. Interpretacao obrigatoria

Registrar que abrir a Fase U nao significa escopo completo definido.

Registrar que abrir a Fase U nao significa autorizacao explicita concedida.

Registrar que abrir a Fase U nao autoriza preparacao operacional concreta.

Registrar que abrir a Fase U nao autoriza execucao.

Registrar que abrir a Fase U nao autoriza rollback real.

Registrar que abrir a Fase U nao autoriza coleta de evidencia operacional real.

Registrar que abrir a Fase U nao autoriza criar comando, script, caller real, rota, CLI, job, bootstrap ou request path.

Registrar que abrir a Fase U nao autoriza alterar registry real, allowlist real ou roteamento real.

Registrar que abrir a Fase U nao autoriza abrir tenant DB real.

Registrar que abrir a Fase U nao autoriza envolver Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

## 10. Criterio de avanco da Fase U

Registrar que a Fase U so podera avancar documentalmente quando forem definidos, em microcortes separados e auditaveis:

- fronteiras;
- entradas;
- saidas;
- exclusoes;
- checklist;
- encerramento documental;
- registro no docs/migration-status.md;
- validacao completa final.

Registrar que a abertura da Fase U nao autoriza nenhum comando real.

Registrar que mesmo uma Fase U completa nao autoriza preparacao operacional concreta sem comando proprio aprovado pelo usuario em momento posterior e com escopo explicitamente delimitado.
