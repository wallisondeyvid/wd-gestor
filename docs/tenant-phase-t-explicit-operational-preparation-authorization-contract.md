# Fase T - Contrato de Autorizacao Explicita para Preparacao Operacional Concreta Manual Controlada Sintetica

## 1. Status

- Aberta.

## 2. Natureza da fase

Registrar que a Fase T e documental, preventiva, nao produtiva, sintetica, nao executiva e nao autorizativa concretamente por padrao.

Registrar que a Fase T existe para definir, de forma documental e controlada, os criterios de autorizacao explicita para uma eventual preparacao operacional concreta manual controlada sintetica em microcortes posteriores.

Registrar que a abertura da Fase T nao autoriza preparacao operacional concreta, execucao, rollback real, evidencia operacional real, caller real, rota, CLI, script, job, bootstrap, request path, registry real, allowlist real, roteamento real, tenant DB real, Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

## 3. Origem

Registrar que a Fase T nasce apos a Fase S ter sido encerrada, validada, publicada e auditada pos-publicacao.

Registrar como base:

- 9c6c287 docs(tenant): completa validacao final da fase s.

Registrar que a Fase S deixou documentado que qualquer preparacao operacional concreta futura exigiria fase posterior propria, autorizacao explicita propria, rollback proprio, evidencias proprias, gates proprios, validacao propria e comando proprio aprovado pelo usuario.

## 4. Objetivo

Registrar que o objetivo da Fase T e construir o contrato documental de autorizacao explicita para uma eventual preparacao operacional concreta manual controlada sintetica.

Registrar que a Fase T devera separar obrigatoriamente:

- autorizacao documental;
- autorizacao explicita;
- preparacao operacional concreta;
- execucao;
- rollback real;
- evidencia operacional real;
- superficie operacional;
- publicacao;
- fase posterior.

Registrar que nenhum desses itens pode ser presumido a partir da abertura da Fase T.

## 5. Escopo permitido nesta abertura

Registrar que nesta abertura da Fase T e permitido apenas:

- criar este contrato documental;
- registrar o status inicial da fase;
- registrar a origem na Fase S;
- registrar os gates iniciais;
- registrar os bloqueios iniciais;
- registrar o criterio de avanco documental inicial;
- atualizar o ledger global docs/migration-status.md com a abertura da Fase T.

Registrar que nada operacional pode ser criado ou executado nesta abertura.

## 6. Gates iniciais da Fase T

Registrar:

- explicitOperationalPreparationAuthorizationContractOpened=true
- explicitOperationalPreparationAuthorizationDefined=false
- explicitOperationalPreparationScopeDefined=false
- explicitOperationalPreparationPrerequisitesDefined=false
- explicitOperationalPreparationRollbackDefined=false
- explicitOperationalPreparationEvidenceDefined=false
- explicitOperationalPreparationChecklistApplied=false
- explicitOperationalPreparationStillForbidden=true
- executionStillForbidden=true
- rollbackStillForbidden=true
- operationalEvidenceStillForbidden=true
- operationalSurfaceStillForbidden=true
- candidateStillSynthetic=true
- nonProductionRequired=true
- nonOperationalUntilExplicitAuthorization=true
- fallbackRequired=true
- blockedReasons=[]

Explicar:

- explicitOperationalPreparationAuthorizationContractOpened=true porque a Fase T foi aberta documentalmente.
- explicitOperationalPreparationAuthorizationDefined=false porque a autorizacao explicita ainda nao foi definida.
- explicitOperationalPreparationScopeDefined=false porque o escopo da autorizacao explicita ainda nao foi definido.
- explicitOperationalPreparationPrerequisitesDefined=false porque as pre-condicoes ainda nao foram definidas.
- explicitOperationalPreparationRollbackDefined=false porque o rollback ainda nao foi definido.
- explicitOperationalPreparationEvidenceDefined=false porque as evidencias ainda nao foram definidas.
- explicitOperationalPreparationChecklistApplied=false porque o checklist ainda nao foi aplicado.
- explicitOperationalPreparationStillForbidden=true porque nenhuma preparacao operacional concreta e permitida nesta abertura.
- executionStillForbidden=true porque nenhuma execucao e permitida nesta fase por padrao.
- rollbackStillForbidden=true porque nenhum rollback real e permitido nesta fase por padrao.
- operationalEvidenceStillForbidden=true porque nenhuma evidencia operacional real pode ser coletada nesta abertura.
- operationalSurfaceStillForbidden=true porque nenhuma superficie operacional pode ser criada nesta abertura.
- candidateStillSynthetic=true porque qualquer candidato permanece obrigatoriamente sintetico.
- nonProductionRequired=true porque qualquer preparacao futura, se um dia autorizada, devera permanecer nao produtiva.
- nonOperationalUntilExplicitAuthorization=true porque a fase permanece nao operacional ate autorizacao explicita propria e posterior.
- fallbackRequired=true porque fallback para baseConnection permanece obrigatorio.
- blockedReasons=[] porque nao ha bloqueio documental para abrir a fase; ha apenas trabalho documental pendente para completar o contrato.

## 7. Bloqueios obrigatorios nesta abertura

Registrar que a abertura da Fase T bloqueia expressamente:

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

## 8. Interpretacao obrigatoria

Registrar que abrir a Fase T nao significa autorizacao explicita concedida.

Registrar que abrir a Fase T nao autoriza preparacao operacional concreta.

Registrar que abrir a Fase T nao autoriza execucao.

Registrar que abrir a Fase T nao autoriza rollback real.

Registrar que abrir a Fase T nao autoriza coleta de evidencia operacional real.

Registrar que abrir a Fase T nao autoriza criar comando, script, caller real, rota, CLI, job, bootstrap ou request path.

Registrar que abrir a Fase T nao autoriza alterar registry real, allowlist real ou roteamento real.

Registrar que abrir a Fase T nao autoriza abrir tenant DB real.

Registrar que abrir a Fase T nao autoriza envolver Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

## 9. Criterio de avanco da Fase T

Registrar que a Fase T so podera avancar documentalmente quando forem definidos, em microcortes separados e auditaveis:

- autorizacao explicita documental;
- escopo da autorizacao explicita;
- pre-condicoes;
- rollback;
- evidencias;
- checklist;
- encerramento documental;
- registro no docs/migration-status.md;
- validacao completa final.

Registrar que a abertura da Fase T nao autoriza nenhum comando real.

Registrar que mesmo uma Fase T completa nao autoriza execucao ou preparacao operacional concreta sem comando proprio aprovado pelo usuario em momento posterior e com escopo explicitamente delimitado.
