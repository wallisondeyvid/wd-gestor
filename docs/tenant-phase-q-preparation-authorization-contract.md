# Fase Q - Contrato de Autorizacao Preparatoria Manual Controlada Sintetica

## 1. Status

- Aberta.

## 2. Natureza da fase

Registrar que a Fase Q e documental, preventiva, nao produtiva, sintetica, nao operacional, nao executiva e nao autorizativa concretamente por padrao.

Registrar que abrir a Fase Q nao concede autorizacao preparatoria concreta.

## 3. Origem

Registrar que a Fase Q nasce apos a Fase P ter sido encerrada, validada, publicada e auditada pos-push.

Registrar que a Fase P definiu o formato minimo de autorizacao explicita valida, mas nao concedeu autorizacao concreta.

## 4. Objetivo

Registrar que o objetivo da Fase Q e definir o contrato documental de uma eventual autorizacao preparatoria manual controlada sintetica.

Registrar que a Fase Q ainda nao executa, nao prepara operacao concreta, nao cria superficie operacional e nao altera qualquer caminho produtivo.

## 5. Fora de escopo

Registrar que estao fora do escopo da Fase Q:

- execucao;
- preparacao operacional concreta;
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
- tenant DB real;
- roteamento real;
- Portal;
- dados reais;
- trafego real;
- usuario real;
- unidade real;
- PostgreSQL;
- codigo produtivo;
- testes;
- package.json.

## 6. Gates iniciais

Registrar:

- preparationAuthorizationContractOpened=true
- preparationAuthorizationDefined=true
- preparationScopeDefined=true
- preparationRollbackDefined=true
- preparationEvidenceDefined=false
- preparationChecklistApplied=false
- preparationStillForbidden=true
- executionStillForbidden=true
- operationalSurfaceStillForbidden=true
- candidateStillSynthetic=true
- nonOperationalPreserved=true
- fallbackRequired=true
- blockedReasons=[]

Explicar:

- preparationAuthorizationContractOpened=true porque a Fase Q foi aberta documentalmente e o contrato preparatorio passou a existir apenas como artefato de referencia.
- preparationAuthorizationDefined=true porque o formato documental de uma autorizacao preparatoria valida foi definido neste microcorte, sem conceder autorizacao concreta e sem autorizar preparacao operacional concreta.
- preparationScopeDefined=true porque o escopo preparatorio autorizavel e os limites preparatorios nao autorizaveis foram definidos documentalmente neste microcorte, sem conceder autorizacao concreta e sem autorizar preparacao operacional concreta.
- preparationRollbackDefined=true porque o rollback preparatorio documental foi definido neste microcorte, sem executar rollback real, sem conceder autorizacao concreta e sem autorizar preparacao operacional concreta.
- preparationEvidenceDefined=false porque nenhuma evidencia preparatoria documental foi definida nesta abertura.
- preparationChecklistApplied=false porque o checklist preparatorio ainda nao foi aplicado nesta abertura.
- preparationStillForbidden=true porque nenhuma preparacao operacional concreta e permitida nesta fase.
- executionStillForbidden=true porque nenhuma execucao e permitida nesta fase.
- operationalSurfaceStillForbidden=true porque nenhuma superficie operacional pode ser criada nesta fase.
- candidateStillSynthetic=true porque qualquer candidato permanece estritamente sintetico nesta fase.
- nonOperationalPreserved=true porque a Fase Q permanece somente documental e nao operacional.
- fallbackRequired=true porque qualquer fase futura continua exigindo fallback documental explicito e controlado antes de qualquer avanco.
- blockedReasons=[] porque nao ha bloqueio documental para a abertura da fase; ha apenas trabalho documental pendente para completude do contrato.

## 7. Autorizacao preparatoria documental

Registrar que a Fase Q define, neste microcorte, o formato documental minimo de uma eventual autorizacao preparatoria manual controlada sintetica.

Registrar que essa definicao nao concede autorizacao concreta agora.

### 7.1 Forma minima da autorizacao preparatoria

Registrar que qualquer autorizacao preparatoria futura precisa conter textualmente:

- fase autorizada;
- objetivo preparatorio autorizado;
- escopo preparatorio autorizado;
- limites preparatorios nao autorizados;
- responsavel/autorizador;
- rollback preparatorio exigido;
- evidencias preparatorias exigidas;
- criterios de entrada;
- criterios de saida;
- confirmacao de que autorizacao preparatoria nao equivale a execucao;
- confirmacao de que autorizacao preparatoria nao autoriza superficie operacional;
- confirmacao de que preparacao operacional concreta ainda permanece proibida enquanto nao houver fase propria e comando proprio aprovado.

### 7.2 Autorizacoes preparatorias invalidas

Registrar que sao invalidas:

- autorizacao implicita;
- autorizacao generica como "pode seguir";
- autorizacao presumida por teste verde;
- autorizacao presumida por commit;
- autorizacao presumida por push;
- autorizacao presumida por documentacao completa;
- autorizacao sem escopo preparatorio;
- autorizacao sem limites preparatorios;
- autorizacao sem rollback preparatorio proprio;
- autorizacao sem evidencias preparatorias proprias;
- autorizacao que misture preparacao e execucao;
- autorizacao que envolva Portal, usuario real, unidade real, dados reais, trafego real ou PostgreSQL fora de fase propria;
- autorizacao que permita criar caller real, rota, CLI, script, job, bootstrap ou request path.

### 7.3 Separacao obrigatoria entre preparar e executar

Registrar:

- autorizacao preparatoria, se algum dia for concedida, nao autoriza execucao;
- autorizacao preparatoria, se algum dia for concedida, nao autoriza rollback real;
- autorizacao preparatoria, se algum dia for concedida, nao autoriza evidencia operacional real;
- autorizacao preparatoria, se algum dia for concedida, nao autoriza Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL;
- autorizacao preparatoria nao pode ser retroativa;
- autorizacao preparatoria nao pode transformar commits anteriores em preparacao autorizada;
- execucao futura exigira fase propria, autorizacao propria, rollback proprio, evidencias proprias, gates proprios, validacao propria e comando/fluxo proprio aprovado.

### 7.4 Resultado da definicao da autorizacao preparatoria

Registrar:

- preparationAuthorizationDefined=true;
- preparationAuthorizationContractOpened permanece true;
- preparationScopeDefined permanece true;
- preparationRollbackDefined permanece false;
- preparationEvidenceDefined permanece false;
- preparationChecklistApplied permanece false;
- preparationStillForbidden permanece true;
- executionStillForbidden permanece true;
- operationalSurfaceStillForbidden permanece true;
- candidateStillSynthetic permanece true;
- nonOperationalPreserved permanece true;
- fallbackRequired permanece true;
- blockedReasons permanece [].

Interpretacao obrigatoria:

- preparationAuthorizationDefined=true significa apenas que o formato documental de uma autorizacao preparatoria valida foi definido.
- preparationAuthorizationDefined=true nao significa que uma autorizacao preparatoria concreta foi concedida.
- preparationAuthorizationDefined=true nao autoriza preparacao operacional concreta.
- preparationAuthorizationDefined=true nao autoriza execucao.
- preparationAuthorizationDefined=true nao autoriza rollback real.
- preparationAuthorizationDefined=true nao autoriza evidencia operacional real.
- preparationAuthorizationDefined=true nao autoriza criar comando, script, caller real, rota, CLI, job, bootstrap ou request path.
- preparationAuthorizationDefined=true nao autoriza alterar registry real, allowlist real ou roteamento.
- preparationAuthorizationDefined=true nao autoriza abrir tenant DB real.
- preparationAuthorizationDefined=true nao autoriza envolver Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

## 8. Escopo preparatorio documental

Registrar que a Fase Q define, neste microcorte, o escopo preparatorio documental de uma eventual preparacao manual controlada sintetica.

Registrar que definir escopo preparatorio nao concede autorizacao concreta e nao autoriza preparacao operacional concreta.

### 8.1 Escopo preparatorio autorizavel em fase futura propria

Registrar que, em fase futura propria e somente mediante autorizacao explicita propria, podera ser considerado escopo preparatorio documental:

- revisar checklist preparatorio;
- revisar rollback preparatorio documental;
- revisar plano de evidencias preparatorias documentais;
- revisar criterios de entrada;
- revisar criterios de saida;
- revisar limites de nao operacao;
- revisar candidato sintetico herdado das fases anteriores;
- revisar matriz de bloqueios antes de qualquer preparacao concreta;
- preparar, ainda documentalmente, um eventual comando futuro;
- preparar, ainda documentalmente, um eventual plano futuro de execucao manual controlada sintetica.

Registrar que esses itens sao apenas escopo autorizavel futuro, nao autorizacao atual.

### 8.2 Limites preparatorios nao autorizaveis

Registrar que permanecem fora do escopo da Fase Q:

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
- uso de Portal;
- uso de dados reais;
- uso de trafego real;
- uso de usuario real;
- uso de unidade real;
- PostgreSQL;
- codigo produtivo;
- alteracao de testes;
- alteracao de package.json.

### 8.3 Candidato sintetico e limites de identidade

Registrar que qualquer referencia preparatoria permanece restrita ao candidato sintetico herdado:

- targetId=fase-j-synthetic-unit-candidate-001
- unidadeId=0000000000000000000000a1
- dbName=wdgestor_unit_0000000000000000000000a1
- databaseKey=wdgestor_unit_0000000000000000000000a1
- plannedAllowlist=["0000000000000000000000a1"]

Registrar que esse candidato nao representa unidade real, usuario real, dado real, trafego real, Portal ou tenant DB real aberto.

### 8.4 Resultado da definicao de escopo preparatorio

Registrar:

- preparationScopeDefined=true;
- preparationAuthorizationDefined permanece true;
- preparationAuthorizationContractOpened permanece true;
- preparationRollbackDefined permanece false;
- preparationEvidenceDefined permanece false;
- preparationChecklistApplied permanece false;
- preparationStillForbidden permanece true;
- executionStillForbidden permanece true;
- operationalSurfaceStillForbidden permanece true;
- candidateStillSynthetic permanece true;
- nonOperationalPreserved permanece true;
- fallbackRequired permanece true;
- blockedReasons permanece [].

Interpretacao obrigatoria:

- preparationScopeDefined=true significa apenas que o escopo preparatorio documental foi definido.
- preparationScopeDefined=true nao significa que preparacao concreta foi autorizada.
- preparationScopeDefined=true nao autoriza preparacao operacional concreta.
- preparationScopeDefined=true nao autoriza execucao.
- preparationScopeDefined=true nao autoriza rollback real.
- preparationScopeDefined=true nao autoriza evidencia operacional real.
- preparationScopeDefined=true nao autoriza criar comando, script, caller real, rota, CLI, job, bootstrap ou request path.
- preparationScopeDefined=true nao autoriza alterar registry real, allowlist real ou roteamento.
- preparationScopeDefined=true nao autoriza abrir tenant DB real.
- preparationScopeDefined=true nao autoriza envolver Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

## 9. Rollback preparatorio documental

Registrar que a Fase Q define, neste microcorte, o rollback preparatorio documental exigido antes de qualquer preparacao manual controlada sintetica futura.

Registrar que definir rollback preparatorio nao executa rollback real, nao concede autorizacao concreta e nao autoriza preparacao operacional concreta.

### 9.1 Objetivo do rollback preparatorio

Registrar que o rollback preparatorio serve para garantir, documentalmente, que qualquer preparacao futura possa ser interrompida antes de tocar superficies operacionais.

Registrar que o rollback preparatorio nao e rollback de banco real, nao e rollback de tenant DB real, nao e rollback de dados reais e nao e rollback de trafego real.

### 9.2 Condicoes minimas de rollback preparatorio futuro

Registrar que qualquer autorizacao preparatoria futura devera conter, antes de qualquer preparacao concreta:

- criterio de parada;
- responsavel por acionar parada;
- lista de arquivos autorizaveis;
- lista de arquivos proibidos;
- comando de reversao documental, quando aplicavel;
- confirmacao de que nenhum tenant DB real foi aberto;
- confirmacao de que nenhum registry real foi alterado;
- confirmacao de que nenhuma allowlist real foi alterada;
- confirmacao de que nenhum roteamento real foi alterado;
- confirmacao de que nenhum caller real, rota, CLI, script, job, bootstrap ou request path foi criado;
- confirmacao de que nenhum dado real, trafego real, usuario real, unidade real, Portal ou PostgreSQL foi envolvido.

### 9.3 Bloqueios de rollback

Registrar que o rollback preparatorio devera bloquear imediatamente qualquer avanco se houver:

- tentativa de tocar codigo produtivo sem fase propria;
- tentativa de criar superficie operacional;
- tentativa de alterar registry real;
- tentativa de alterar allowlist real;
- tentativa de abrir tenant DB real;
- tentativa de mudar roteamento real;
- tentativa de envolver Portal;
- tentativa de envolver dados reais;
- tentativa de envolver trafego real;
- tentativa de envolver usuario real;
- tentativa de envolver unidade real;
- tentativa de envolver PostgreSQL;
- tentativa de misturar preparacao e execucao;
- ausencia de autorizacao explicita propria;
- ausencia de escopo proprio;
- ausencia de evidencias proprias;
- ausencia de gates proprios.

### 9.4 Resultado da definicao de rollback preparatorio

Registrar:

- preparationRollbackDefined=true;
- preparationScopeDefined permanece true;
- preparationAuthorizationDefined permanece true;
- preparationAuthorizationContractOpened permanece true;
- preparationEvidenceDefined permanece false;
- preparationChecklistApplied permanece false;
- preparationStillForbidden permanece true;
- executionStillForbidden permanece true;
- operationalSurfaceStillForbidden permanece true;
- candidateStillSynthetic permanece true;
- nonOperationalPreserved permanece true;
- fallbackRequired permanece true;
- blockedReasons permanece [].

Interpretacao obrigatoria:

- preparationRollbackDefined=true significa apenas que o rollback preparatorio documental foi definido.
- preparationRollbackDefined=true nao significa que rollback real foi executado.
- preparationRollbackDefined=true nao autoriza preparacao operacional concreta.
- preparationRollbackDefined=true nao autoriza execucao.
- preparationRollbackDefined=true nao autoriza rollback real.
- preparationRollbackDefined=true nao autoriza evidencia operacional real.
- preparationRollbackDefined=true nao autoriza criar comando, script, caller real, rota, CLI, job, bootstrap ou request path.
- preparationRollbackDefined=true nao autoriza alterar registry real, allowlist real ou roteamento.
- preparationRollbackDefined=true nao autoriza abrir tenant DB real.
- preparationRollbackDefined=true nao autoriza envolver Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

## 10. Interpretacao obrigatoria

Registrar:

- preparationAuthorizationContractOpened=true nao autoriza preparacao operacional concreta.
- preparationAuthorizationContractOpened=true nao autoriza execucao.
- preparationAuthorizationContractOpened=true nao autoriza rollback real.
- preparationAuthorizationContractOpened=true nao autoriza evidencia operacional real.
- preparationAuthorizationContractOpened=true nao autoriza criar comando, script, caller real, rota, CLI, job, bootstrap ou request path.
- preparationAuthorizationContractOpened=true nao autoriza alterar registry real, allowlist real ou roteamento.
- preparationAuthorizationContractOpened=true nao autoriza abrir tenant DB real.
- preparationAuthorizationContractOpened=true nao autoriza envolver Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.
- preparationAuthorizationContractOpened=true nao abre fase posterior automaticamente.

## 11. Criterio de avanco da Fase Q

Registrar que a Fase Q so podera avancar documentalmente quando forem definidos:

- autorizacao preparatoria textual;
- escopo preparatorio;
- limites preparatorios;
- rollback preparatorio documental;
- evidencias preparatorias documentais;
- checklist preparatorio;
- gates de bloqueio;
- interpretacao obrigatoria.

Registrar que mesmo um contrato preparatorio completo nao autoriza execucao.
