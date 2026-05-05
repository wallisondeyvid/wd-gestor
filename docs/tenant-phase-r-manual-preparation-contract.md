# Fase R - Contrato de Preparacao Manual Controlada Sintetica

## 1. Status

- Aberta.

## 2. Natureza da fase

Registrar que a Fase R e documental, preventiva, nao produtiva, sintetica, nao operacional, nao executiva e nao autorizativa concretamente por padrao.

Registrar que a Fase R sucede a Fase Q, que encerrou e publicou o contrato de autorizacao preparatoria manual controlada sintetica.

## 3. Origem

Registrar:

- Fase anterior: Fase Q - Contrato de Autorizacao Preparatoria Manual Controlada Sintetica.
- Commit publicado da Fase Q: 1d6c93d docs(tenant): completa validacao final da fase q.
- Documento herdado: docs/tenant-phase-q-preparation-authorization-contract.md.
- Status herdado: Fase Q encerrada, validada e publicada.
- Validacao herdada: npm test completo verde.

## 4. Objetivo da Fase R

Registrar que a Fase R tem como objetivo definir, ainda documentalmente, o contrato de preparacao manual controlada sintetica.

Registrar que a Fase R nao executa preparacao concreta, nao cria superficie operacional e nao autoriza execucao.

## 5. Fora de escopo

Registrar explicitamente que permanecem fora de escopo:

- preparacao operacional concreta;
- execucao;
- rollback real;
- evidencia operacional real;
- criacao de comando executavel;
- criacao de script;
- criacao de caller real;
- criacao de rota;
- criacao de CLI;
- criacao de job;
- criacao de bootstrap;
- criacao de request path;
- alteracao de registry real;
- alteracao de allowlist real;
- alteracao de roteamento real;
- abertura de tenant DB real;
- Portal;
- dados reais;
- trafego real;
- usuario real;
- unidade real;
- PostgreSQL;
- codigo produtivo;
- alteracao de testes;
- alteracao de package.json.

## 6. Gates iniciais

Registrar:

- manualPreparationContractOpened=true
- manualPreparationScopeDefined=false
- manualPreparationInputsDefined=false
- manualPreparationRollbackDefined=false
- manualPreparationEvidenceDefined=false
- manualPreparationChecklistApplied=false
- preparationStillForbidden=true
- executionStillForbidden=true
- operationalSurfaceStillForbidden=true
- candidateStillSynthetic=true
- nonOperationalPreserved=true
- fallbackRequired=true
- blockedReasons=[]

Explicar:

- manualPreparationContractOpened=true porque a Fase R foi aberta documentalmente e o contrato de preparacao manual controlada sintetica passa a existir apenas como artefato de referencia.
- manualPreparationScopeDefined=false porque o escopo de preparacao manual ainda nao foi definido documentalmente nesta abertura.
- manualPreparationInputsDefined=false porque as entradas documentais necessarias para eventual preparacao manual ainda nao foram definidas nesta abertura.
- manualPreparationRollbackDefined=false porque o rollback preparatorio documental ainda nao foi definido nesta abertura.
- manualPreparationEvidenceDefined=false porque as evidencias documentais de preparacao ainda nao foram definidas nesta abertura.
- manualPreparationChecklistApplied=false porque o checklist documental da Fase R ainda nao foi aplicado nesta abertura.
- preparationStillForbidden=true porque nenhuma preparacao operacional concreta e permitida nesta fase.
- executionStillForbidden=true porque nenhuma execucao e permitida nesta fase.
- operationalSurfaceStillForbidden=true porque nenhuma superficie operacional pode ser criada nesta fase.
- candidateStillSynthetic=true porque qualquer candidato permanece estritamente sintetico nesta fase.
- nonOperationalPreserved=true porque a Fase R permanece somente documental e nao operacional.
- fallbackRequired=true porque qualquer fase futura continua exigindo fallback documental explicito e controlado antes de qualquer avanco.
- blockedReasons=[] porque nao ha bloqueio documental para abrir a fase; ha apenas trabalho documental pendente para completar o contrato.

## 7. Candidato sintetico herdado

Registrar:

- targetId=fase-j-synthetic-unit-candidate-001
- unidadeId=0000000000000000000000a1
- dbName=wdgestor_unit_0000000000000000000000a1
- databaseKey=wdgestor_unit_0000000000000000000000a1
- plannedAllowlist=["0000000000000000000000a1"]

Registrar que esse candidato nao representa unidade real, usuario real, dado real, trafego real, Portal ou tenant DB real aberto.

## 8. Interpretacao obrigatoria

Registrar que abrir a Fase R nao autoriza preparacao operacional concreta, execucao, rollback real, evidencia operacional real, caller real, rota/CLI/script/job/bootstrap/request path, registry real, allowlist real, tenant DB real, roteamento, Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

## 9. Criterio de avanco da Fase R

Registrar que a Fase R so podera avancar documentalmente quando forem definidos:

- escopo de preparacao manual;
- entradas documentais;
- limites operacionais;
- rollback preparatorio;
- evidencias documentais;
- checklist;
- interpretacao obrigatoria.

Registrar que mesmo um contrato completo da Fase R nao autoriza execucao.
