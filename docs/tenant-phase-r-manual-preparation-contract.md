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
- manualPreparationScopeDefined=true
- manualPreparationInputsDefined=true
- manualPreparationRollbackDefined=true
- manualPreparationEvidenceDefined=true
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
- manualPreparationScopeDefined=true porque o escopo de preparacao manual controlada sintetica foi definido documentalmente neste microcorte, sem conceder autorizacao concreta e sem autorizar preparacao operacional concreta.
- manualPreparationInputsDefined=true porque as entradas documentais necessarias para eventual preparacao manual controlada sintetica foram definidas neste microcorte, sem conceder autorizacao concreta e sem autorizar preparacao operacional concreta.
- manualPreparationRollbackDefined=true porque o rollback preparatorio documental da preparacao manual controlada sintetica foi definido neste microcorte, sem executar rollback real, sem conceder autorizacao concreta e sem autorizar preparacao operacional concreta.
- manualPreparationEvidenceDefined=true porque as evidencias documentais da preparacao manual controlada sintetica foram definidas neste microcorte, sem coletar evidencia operacional real, sem conceder autorizacao concreta e sem autorizar preparacao operacional concreta.
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

## 8. Escopo de preparacao manual documental

Registrar que a Fase R define, neste microcorte, o escopo documental da preparacao manual controlada sintetica.

Registrar que definir escopo de preparacao nao concede autorizacao concreta, nao autoriza preparacao operacional concreta e nao autoriza execucao.

### 8.1 Escopo autorizavel documentalmente

Registrar que a Fase R podera definir documentalmente, em microcortes futuros:

- entradas documentais necessarias;
- limites operacionais;
- rollback preparatorio;
- evidencias documentais;
- checklist documental;
- criterios de parada;
- criterios de avanco;
- interpretacao obrigatoria;
- candidato sintetico herdado;
- relacao com a autorizacao preparatoria da Fase Q;
- plano textual de preparacao futura.

### 8.2 Escopo nao autorizavel

Registrar que permanecem fora de autorizacao:

- preparacao operacional concreta;
- execucao;
- rollback real;
- evidencia operacional real;
- comando executavel;
- script;
- caller real;
- rota;
- CLI;
- job;
- bootstrap;
- request path;
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
- testes;
- package.json.

### 8.3 Limite do escopo definido

Registrar que manualPreparationScopeDefined=true significa apenas que o escopo documental da preparacao foi definido.

Registrar que manualPreparationScopeDefined=true nao significa que preparacao concreta foi autorizada.

Registrar que qualquer preparacao operacional concreta futura exigira fase propria, autorizacao propria, comando proprio aprovado, rollback proprio, evidencias proprias e validacao propria.

### 8.4 Resultado da definicao de escopo

Registrar:

- manualPreparationScopeDefined=true;
- manualPreparationContractOpened permanece true;
- manualPreparationInputsDefined permanece true;
- manualPreparationRollbackDefined permanece true;
- manualPreparationEvidenceDefined permanece true;
- manualPreparationChecklistApplied permanece false;
- preparationStillForbidden permanece true;
- executionStillForbidden permanece true;
- operationalSurfaceStillForbidden permanece true;
- candidateStillSynthetic permanece true;
- nonOperationalPreserved permanece true;
- fallbackRequired permanece true;
- blockedReasons permanece [].

Interpretacao obrigatoria:

- manualPreparationScopeDefined=true significa apenas que o escopo documental da preparacao manual foi definido.
- manualPreparationScopeDefined=true nao autoriza preparacao operacional concreta.
- manualPreparationScopeDefined=true nao autoriza execucao.
- manualPreparationScopeDefined=true nao autoriza rollback real.
- manualPreparationScopeDefined=true nao autoriza evidencia operacional real.
- manualPreparationScopeDefined=true nao autoriza criar comando, script, caller real, rota, CLI, job, bootstrap ou request path.
- manualPreparationScopeDefined=true nao autoriza alterar registry real, allowlist real ou roteamento.
- manualPreparationScopeDefined=true nao autoriza abrir tenant DB real.
- manualPreparationScopeDefined=true nao autoriza envolver Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

## 9. Entradas de preparacao manual documental

Registrar que a Fase R define, neste microcorte, as entradas documentais necessarias para eventual preparacao manual controlada sintetica futura.

Registrar que definir entradas documentais nao concede autorizacao concreta, nao autoriza preparacao operacional concreta e nao autoriza execucao.

### 9.1 Entradas documentais minimas

Registrar que qualquer preparacao manual controlada sintetica futura devera exigir, antes de qualquer acao concreta, evidencia documental de:

- fase explicitamente aberta para preparacao concreta;
- autorizacao textual explicita do usuario;
- escopo de preparacao aprovado;
- candidato sintetico confirmado;
- limites operacionais preservados;
- rollback preparatorio definido;
- evidencias documentais definidas;
- checklist aplicado;
- ausencia de Portal;
- ausencia de dados reais;
- ausencia de trafego real;
- ausencia de usuario real;
- ausencia de unidade real;
- ausencia de PostgreSQL;
- ausencia de tenant DB real aberto;
- ausencia de registry real alterado;
- ausencia de allowlist real alterada;
- ausencia de roteamento real alterado;
- ausencia de caller real, rota, CLI, script, job, bootstrap ou request path.

### 9.2 Entradas explicitamente invalidas nesta fase

Registrar que a Fase R proibe tratar como entrada valida:

- log de execucao real;
- log de rollback real;
- conexao real com tenant DB;
- alteracao real em registry;
- alteracao real em allowlist;
- alteracao real em roteamento;
- evidencia obtida via Portal;
- evidencia baseada em dados reais;
- evidencia baseada em trafego real;
- evidencia baseada em usuario real;
- evidencia baseada em unidade real;
- evidencia baseada em PostgreSQL;
- evidencia obtida por caller real, rota, CLI, script, job, bootstrap ou request path;
- comando executavel como entrada autorizativa;
- commit como autorizacao;
- baseline verde como autorizacao;
- push como autorizacao.

### 9.3 Limite das entradas definidas

Registrar que manualPreparationInputsDefined=true significa apenas que as entradas documentais foram definidas.

Registrar que manualPreparationInputsDefined=true nao significa que as entradas foram coletadas operacionalmente.

Registrar que manualPreparationInputsDefined=true nao autoriza preparacao operacional concreta, execucao ou rollback real.

### 9.4 Resultado da definicao de entradas

Registrar:

- manualPreparationInputsDefined=true;
- manualPreparationScopeDefined permanece true;
- manualPreparationContractOpened permanece true;
- manualPreparationRollbackDefined permanece true;
- manualPreparationEvidenceDefined permanece true;
- manualPreparationChecklistApplied permanece false;
- preparationStillForbidden permanece true;
- executionStillForbidden permanece true;
- operationalSurfaceStillForbidden permanece true;
- candidateStillSynthetic permanece true;
- nonOperationalPreserved permanece true;
- fallbackRequired permanece true;
- blockedReasons permanece [].

Interpretacao obrigatoria:

- manualPreparationInputsDefined=true significa apenas que as entradas documentais da preparacao manual foram definidas.
- manualPreparationInputsDefined=true nao significa que entradas operacionais foram coletadas.
- manualPreparationInputsDefined=true nao autoriza preparacao operacional concreta.
- manualPreparationInputsDefined=true nao autoriza execucao.
- manualPreparationInputsDefined=true nao autoriza rollback real.
- manualPreparationInputsDefined=true nao autoriza evidencia operacional real.
- manualPreparationInputsDefined=true nao autoriza criar comando, script, caller real, rota, CLI, job, bootstrap ou request path.
- manualPreparationInputsDefined=true nao autoriza alterar registry real, allowlist real ou roteamento.
- manualPreparationInputsDefined=true nao autoriza abrir tenant DB real.
- manualPreparationInputsDefined=true nao autoriza envolver Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

## 10. Rollback de preparacao manual documental

Registrar que a Fase R define, neste microcorte, o rollback preparatorio documental necessario para eventual preparacao manual controlada sintetica futura.

Registrar que definir rollback documental nao executa rollback real, nao concede autorizacao concreta, nao autoriza preparacao operacional concreta e nao autoriza execucao.

### 10.1 Premissas do rollback documental

Registrar que qualquer rollback futuro, se algum dia houver fase propria para acao concreta, devera exigir antes:

- fase explicitamente aberta para preparacao concreta;
- autorizacao textual explicita do usuario;
- escopo aprovado;
- entradas documentais confirmadas;
- evidencias documentais definidas;
- checklist aplicado;
- plano de reversao textual aprovado;
- ausencia de dados reais;
- ausencia de trafego real;
- ausencia de usuario real;
- ausencia de unidade real;
- ausencia de Portal;
- ausencia de PostgreSQL;
- candidato estritamente sintetico;
- fallback preservado;
- criterio de parada definido;
- criterio de abortar definido.

### 10.2 Acoes proibidas nesta fase

Registrar que a Fase R proibe:

- executar rollback real;
- executar preparacao real;
- executar piloto real;
- alterar registry real;
- alterar allowlist real;
- alterar roteamento real;
- abrir tenant DB real;
- acionar caller real;
- acionar rota;
- acionar CLI;
- acionar script;
- acionar job;
- acionar bootstrap;
- acionar request path;
- usar Portal;
- usar dados reais;
- usar trafego real;
- usar usuario real;
- usar unidade real;
- usar PostgreSQL;
- coletar evidencia operacional real.

### 10.3 Criterio documental de reversibilidade

Registrar que a reversibilidade permanece apenas documental nesta fase.

Registrar que qualquer preparacao concreta futura devera ser abortavel antes de tocar em registry real, allowlist real, roteamento real, tenant DB real, Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

Registrar que fallbackRequired=true permanece obrigatorio.

### 10.4 Resultado da definicao de rollback

Registrar:

- manualPreparationRollbackDefined=true;
- manualPreparationInputsDefined permanece true;
- manualPreparationScopeDefined permanece true;
- manualPreparationContractOpened permanece true;
- manualPreparationEvidenceDefined permanece true;
- manualPreparationChecklistApplied permanece false;
- preparationStillForbidden permanece true;
- executionStillForbidden permanece true;
- operationalSurfaceStillForbidden permanece true;
- candidateStillSynthetic permanece true;
- nonOperationalPreserved permanece true;
- fallbackRequired permanece true;
- blockedReasons permanece [].

Interpretacao obrigatoria:

- manualPreparationRollbackDefined=true significa apenas que o rollback preparatorio documental foi definido.
- manualPreparationRollbackDefined=true nao significa que rollback real foi executado.
- manualPreparationRollbackDefined=true nao autoriza preparacao operacional concreta.
- manualPreparationRollbackDefined=true nao autoriza execucao.
- manualPreparationRollbackDefined=true nao autoriza rollback real.
- manualPreparationRollbackDefined=true nao autoriza evidencia operacional real.
- manualPreparationRollbackDefined=true nao autoriza criar comando, script, caller real, rota, CLI, job, bootstrap ou request path.
- manualPreparationRollbackDefined=true nao autoriza alterar registry real, allowlist real ou roteamento.
- manualPreparationRollbackDefined=true nao autoriza abrir tenant DB real.
- manualPreparationRollbackDefined=true nao autoriza envolver Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

## 11. Evidencias de preparacao manual documental

Registrar que a Fase R define, neste microcorte, as evidencias documentais necessarias para eventual preparacao manual controlada sintetica futura.

Registrar que definir evidencias documentais nao coleta evidencia operacional real, nao concede autorizacao concreta, nao autoriza preparacao operacional concreta e nao autoriza execucao.

### 11.1 Evidencias documentais esperadas

Registrar que qualquer preparacao manual controlada sintetica futura devera exigir evidencias textuais de:

- fase explicitamente aberta para preparacao concreta;
- autorizacao textual explicita do usuario;
- escopo aprovado;
- entradas documentais confirmadas;
- rollback preparatorio definido;
- checklist aplicado;
- candidato sintetico confirmado;
- fallback preservado;
- ausencia de Portal;
- ausencia de dados reais;
- ausencia de trafego real;
- ausencia de usuario real;
- ausencia de unidade real;
- ausencia de PostgreSQL;
- ausencia de tenant DB real aberto;
- ausencia de registry real alterado;
- ausencia de allowlist real alterada;
- ausencia de roteamento real alterado;
- ausencia de caller real, rota, CLI, script, job, bootstrap ou request path;
- plano textual de parada;
- plano textual de abortar;
- criterios documentais de avanco e bloqueio.

### 11.2 Evidencias proibidas nesta fase

Registrar que a Fase R proibe tratar como evidencia valida:

- evidencia operacional real;
- log de execucao real;
- log de rollback real;
- evidencia obtida via Portal;
- evidencia baseada em dados reais;
- evidencia baseada em trafego real;
- evidencia baseada em usuario real;
- evidencia baseada em unidade real;
- evidencia baseada em PostgreSQL;
- evidencia obtida por conexao real com tenant DB;
- evidencia obtida por alteracao real de registry;
- evidencia obtida por alteracao real de allowlist;
- evidencia obtida por alteracao real de roteamento;
- evidencia obtida por caller real, rota, CLI, script, job, bootstrap ou request path;
- comando executavel como evidencia autorizativa;
- commit como autorizacao;
- baseline verde como autorizacao;
- push como autorizacao.

### 11.3 Limite das evidencias definidas

Registrar que manualPreparationEvidenceDefined=true significa apenas que as evidencias documentais foram definidas.

Registrar que manualPreparationEvidenceDefined=true nao significa que evidencia operacional real foi coletada.

Registrar que manualPreparationEvidenceDefined=true nao autoriza preparacao operacional concreta, execucao ou rollback real.

### 11.4 Resultado da definicao de evidencias

Registrar:

- manualPreparationEvidenceDefined=true;
- manualPreparationRollbackDefined permanece true;
- manualPreparationInputsDefined permanece true;
- manualPreparationScopeDefined permanece true;
- manualPreparationContractOpened permanece true;
- manualPreparationChecklistApplied permanece false;
- preparationStillForbidden permanece true;
- executionStillForbidden permanece true;
- operationalSurfaceStillForbidden permanece true;
- candidateStillSynthetic permanece true;
- nonOperationalPreserved permanece true;
- fallbackRequired permanece true;
- blockedReasons permanece [].

Interpretacao obrigatoria:

- manualPreparationEvidenceDefined=true significa apenas que as evidencias documentais da preparacao manual foram definidas.
- manualPreparationEvidenceDefined=true nao significa que evidencia operacional real foi coletada.
- manualPreparationEvidenceDefined=true nao autoriza preparacao operacional concreta.
- manualPreparationEvidenceDefined=true nao autoriza execucao.
- manualPreparationEvidenceDefined=true nao autoriza rollback real.
- manualPreparationEvidenceDefined=true nao autoriza criar comando, script, caller real, rota, CLI, job, bootstrap ou request path.
- manualPreparationEvidenceDefined=true nao autoriza alterar registry real, allowlist real ou roteamento.
- manualPreparationEvidenceDefined=true nao autoriza abrir tenant DB real.
- manualPreparationEvidenceDefined=true nao autoriza envolver Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

## 12. Interpretacao obrigatoria

Registrar que abrir a Fase R nao autoriza preparacao operacional concreta, execucao, rollback real, evidencia operacional real, caller real, rota/CLI/script/job/bootstrap/request path, registry real, allowlist real, tenant DB real, roteamento, Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

## 13. Criterio de avanco da Fase R

Registrar que a Fase R so podera avancar documentalmente quando forem definidos:

- escopo de preparacao manual;
- entradas documentais;
- limites operacionais;
- rollback preparatorio;
- evidencias documentais;
- checklist;
- interpretacao obrigatoria.

Registrar que mesmo um contrato completo da Fase R nao autoriza execucao.
