# Fase P - Contrato de Autorizacao Explicita Pre-Preparacao Manual Controlada Sintetica

## 1. Status

- Aberta.

## 2. Natureza da fase

Registrar que a Fase P e documental, preventiva, nao produtiva, sintetica, nao operacional e nao autorizativa por padrao.

Registrar que a Fase P existe para definir os requisitos de autorizacao explicita que seriam necessarios antes de qualquer preparacao manual controlada sintetica futura.

Registrar que abrir a Fase P nao autoriza:

- execucao;
- preparacao operacional concreta;
- rollback real;
- coleta de evidencia operacional real;
- caller real;
- rota;
- CLI;
- script;
- job;
- bootstrap;
- request path;
- alteracao de registry real;
- alteracao de allowlist real;
- abertura de tenant DB real;
- mudanca de roteamento;
- Portal;
- dados reais;
- trafego real;
- usuario real;
- unidade real;
- PostgreSQL.

## 3. Origem

Registrar que a Fase P nasce apos:

- Fase N encerrada, validada e publicada;
- Fase O encerrada, validada, publicada e auditada.

Registrar que a Fase O concluiu uma matriz documental de riscos pre-execucao, mas nao concedeu autorizacao operacional nem preparatoria.

## 4. Objetivo

Registrar que o objetivo da Fase P e definir um contrato documental de autorizacao explicita pre-preparacao, especificando:

- quais decisoes humanas explicitas seriam exigidas;
- quais limites precisam permanecer bloqueados;
- quais evidencias seriam necessarias antes de qualquer fase futura;
- quais gates impedem transformar documentacao em operacao;
- quais condicoes impedem avanco automatico.

## 5. Fora de escopo

Registrar que estao fora do escopo da Fase P:

- executar piloto sintetico;
- preparar ambiente operacional concreto;
- criar comando;
- criar script;
- criar rota;
- criar caller real;
- criar job;
- criar bootstrap;
- plugar em request path;
- alterar registry real;
- alterar allowlist real;
- abrir tenant DB real;
- mudar roteamento;
- usar Portal;
- usar dados reais;
- usar trafego real;
- usar usuario real;
- usar unidade real;
- envolver PostgreSQL;
- alterar codigo produtivo;
- alterar testes;
- alterar package.json.

## 6. Gates iniciais

Registrar os gates iniciais:

- authorizationContractOpened=true
- explicitAuthorizationDefined=true
- authorizationActorsDefined=true
- authorizationScopeDefined=true
- authorizationEvidenceDefined=true
- preparationStillForbidden=true
- executionStillForbidden=true
- operationalSurfaceStillForbidden=true
- candidateStillSynthetic=true
- nonOperationalPreserved=true
- fallbackRequired=true
- blockedReasons=[]

Explicar:

- authorizationContractOpened=true porque a Fase P foi aberta documentalmente.
- explicitAuthorizationDefined=true porque o formato e as condicoes minimas de uma autorizacao explicita valida foram definidos documentalmente neste microcorte sem conceder autorizacao concreta.
- authorizationActorsDefined=true porque os atores/responsaveis documentais pela autorizacao explicita foram definidos neste microcorte sem autorizar qualquer preparacao ou execucao.
- authorizationScopeDefined=true porque o escopo autorizavel futuro e os limites nao autorizaveis foram definidos documentalmente neste microcorte sem conceder autorizacao explicita final.
- authorizationEvidenceDefined=true porque as evidencias exigidas antes de qualquer autorizacao futura foram definidas documentalmente neste microcorte sem autorizar preparacao operacional concreta nem execucao.
- preparationStillForbidden=true porque nenhuma preparacao operacional concreta e permitida nesta fase.
- executionStillForbidden=true porque nenhuma execucao e permitida nesta fase.
- operationalSurfaceStillForbidden=true porque nenhuma superficie operacional pode ser criada.
- candidateStillSynthetic=true porque o unico candidato permanece sintetico.
- nonOperationalPreserved=true porque a fase permanece documental.
- fallbackRequired=true porque fallback para `baseConnection` permanece obrigatorio.
- blockedReasons=[] porque nao ha bloqueio documental inicial; ha apenas ausencia do contrato completo.

## 7. Atores de autorizacao explicita

Registrar que os atores da Fase P sao definidos apenas para fins documentais e de controle de decisao futura. A definicao de atores nao autoriza preparacao, execucao, rollback real, coleta de evidencia operacional real ou criacao de superficie operacional.

Definir os seguintes papeis documentais:

### 7.1 Responsavel tecnico pela migracao

Registrar:

- avalia coerencia tecnica do contrato;
- confirma se as restricoes de fallback, isolamento e nao operacionalidade foram preservadas;
- nao pode, sozinho, autorizar execucao;
- nao pode, sozinho, autorizar preparacao operacional concreta;
- nao pode transformar documentacao em caller real, script, rota, CLI, job, bootstrap ou request path.

### 7.2 Responsavel funcional pelo WD Gestor

Registrar:

- avalia impactos funcionais esperados;
- confirma que a visao global de master/admin sem unidade canonica permanece decisao funcional preservada;
- confirma que nao ha envolvimento de Portal, usuario real, unidade real, dados reais ou trafego real;
- nao pode, sozinho, autorizar execucao;
- nao pode, sozinho, autorizar preparacao operacional concreta.

### 7.3 Responsavel por seguranca/rollback

Registrar:

- avalia se qualquer fase futura possui plano de rollback proprio antes de execucao;
- confirma que rollback documental nao e rollback real;
- confirma que nenhum rollback real e permitido na Fase P;
- pode bloquear avanco documental se rollback proprio futuro estiver ausente ou ambiguo.

### 7.4 Responsavel por evidencias e validacao

Registrar:

- avalia se evidencia documental, baseline curta, npm test completo e evidencia operacional real estao separados;
- confirma que baseline verde nao e autorizacao;
- confirma que evidencia documental nao substitui evidencia operacional real;
- pode bloquear avanco documental se evidencia futura estiver ambigua.

### 7.5 Usuario/autorizador explicito

Registrar:

- e o unico que pode conceder autorizacao explicita textual para avanco de fase;
- autorizacao precisa ser especifica, limitada e registrada;
- autorizacao generica nao basta;
- autorizacao para documentar nao equivale a autorizacao para preparar;
- autorizacao para preparar nao equivale a autorizacao para executar;
- autorizacao para executar, se algum dia existir, exigira fase propria, rollback proprio, evidencias proprias, gates proprios e escopo proprio.

### 7.6 Resultado dos atores

Registrar:

- authorizationActorsDefined=true;
- authorizationContractOpened permanece true;
- explicitAuthorizationDefined permanece false;
- authorizationScopeDefined permanece true;
- authorizationEvidenceDefined permanece true;
- preparationStillForbidden permanece true;
- executionStillForbidden permanece true;
- operationalSurfaceStillForbidden permanece true;
- candidateStillSynthetic permanece true;
- nonOperationalPreserved permanece true;
- fallbackRequired permanece true;
- blockedReasons permanece [].

Interpretacao obrigatoria:

- authorizationActorsDefined=true significa apenas que os papeis documentais de autorizacao foram definidos.
- authorizationActorsDefined=true nao autoriza preparacao operacional concreta.
- authorizationActorsDefined=true nao autoriza execucao.
- authorizationActorsDefined=true nao autoriza rollback real.
- authorizationActorsDefined=true nao autoriza evidencia operacional real.
- authorizationActorsDefined=true nao autoriza criar comando, script, caller real, rota, CLI, job, bootstrap ou request path.
- authorizationActorsDefined=true nao autoriza alterar registry real, allowlist real ou roteamento.
- authorizationActorsDefined=true nao autoriza abrir tenant DB real.
- authorizationActorsDefined=true nao autoriza envolver Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

## 8. Escopo autorizavel e limites nao autorizaveis

Registrar que a Fase P define apenas o escopo que poderia ser autorizado em uma etapa futura, mediante autorizacao explicita textual, especifica e limitada. A definicao de escopo autorizavel nao e autorizacao em si.

### 8.1 Escopo autorizavel futuro, ainda nao concedido

Registrar que, em uma fase futura propria, poderia ser autorizavel apenas:

- preparacao documental complementar;
- revisao documental de rollback futuro;
- revisao documental de evidencias futuras;
- definicao documental de criterios de entrada e saida;
- definicao documental de checklist pre-preparacao;
- definicao documental de limites de nao operacao;
- eventual preparacao manual sintetica somente se houver fase futura propria, autorizacao explicita, escopo proprio, rollback proprio e evidencia propria.

Registrar que nada acima esta autorizado agora.

### 8.2 Limites nao autorizaveis na Fase P

Registrar que a Fase P nao pode autorizar:

- execucao;
- preparacao operacional concreta;
- rollback real;
- coleta de evidencia operacional real;
- caller real;
- rota;
- CLI;
- script;
- job;
- bootstrap;
- request path;
- alteracao de registry real;
- alteracao de allowlist real;
- abertura de tenant DB real;
- mudanca de roteamento;
- Portal;
- dados reais;
- trafego real;
- usuario real;
- unidade real;
- PostgreSQL;
- alteracao de codigo produtivo;
- alteracao de testes;
- alteracao de package.json.

### 8.3 Escopo sintetico preservado

Registrar que o unico candidato admitido continua sendo:

- targetId=fase-j-synthetic-unit-candidate-001
- unidadeId=0000000000000000000000a1
- dbName=wdgestor_unit_0000000000000000000000a1
- databaseKey=wdgestor_unit_0000000000000000000000a1
- plannedAllowlist=["0000000000000000000000a1"]

Registrar:

- o candidato permanece sintetico;
- nao ha unidade real;
- nao ha usuario real;
- nao ha dados reais;
- nao ha trafego real;
- nao ha Portal;
- nao ha tenant DB real aberto;
- nao ha allowlist real aplicada;
- nao ha registry real alterado.

### 8.4 Resultado do escopo

Registrar:

- authorizationScopeDefined=true;
- authorizationActorsDefined permanece true;
- authorizationContractOpened permanece true;
- explicitAuthorizationDefined permanece false;
- authorizationEvidenceDefined permanece true;
- preparationStillForbidden permanece true;
- executionStillForbidden permanece true;
- operationalSurfaceStillForbidden permanece true;
- candidateStillSynthetic permanece true;
- nonOperationalPreserved permanece true;
- fallbackRequired permanece true;
- blockedReasons permanece [].

Interpretacao obrigatoria:

- authorizationScopeDefined=true significa apenas que o escopo autorizavel futuro e os limites nao autorizaveis foram definidos documentalmente.
- authorizationScopeDefined=true nao autoriza preparacao operacional concreta.
- authorizationScopeDefined=true nao autoriza execucao.
- authorizationScopeDefined=true nao autoriza rollback real.
- authorizationScopeDefined=true nao autoriza evidencia operacional real.
- authorizationScopeDefined=true nao autoriza criar comando, script, caller real, rota, CLI, job, bootstrap ou request path.
- authorizationScopeDefined=true nao autoriza alterar registry real, allowlist real ou roteamento.
- authorizationScopeDefined=true nao autoriza abrir tenant DB real.
- authorizationScopeDefined=true nao autoriza envolver Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

## 9. Evidencias exigidas antes de qualquer autorizacao futura

Registrar que a Fase P define apenas quais evidencias seriam exigidas antes de qualquer autorizacao futura. A definicao de evidencias exigidas nao e coleta de evidencia operacional real e nao autoriza execucao nem preparacao operacional concreta.

### 9.1 Evidencia documental obrigatoria

Registrar que qualquer avanco futuro exigiria, no minimo:

- contrato documental completo;
- escopo explicito e limitado;
- limites nao autorizaveis registrados;
- rollback futuro proprio definido documentalmente;
- criterios de entrada e saida definidos documentalmente;
- checklist pre-preparacao definido documentalmente;
- interpretacao obrigatoria registrada;
- ausencia de bloqueios documentais pendentes.

### 9.2 Evidencia de validacao tecnica obrigatoria

Registrar que qualquer avanco futuro exigiria, no minimo:

- baseline curta verde;
- `npm test` completo verde;
- registro da tupla completa de testes;
- status git limpo;
- historico local coerente;
- ausencia de alteracoes fora do escopo autorizado;
- confirmacao de que nenhum arquivo operacional indevido foi alterado.

Registrar que baseline curta verde e `npm test` completo verde sao requisitos de seguranca, mas nao sao autorizacao por si so.

### 9.3 Evidencia operacional real

Registrar que evidencia operacional real permanece proibida na Fase P.

Registrar que nao e permitido na Fase P:

- abrir tenant DB real;
- acionar registry real;
- aplicar allowlist real;
- executar roteamento real;
- criar caller real;
- executar script, CLI, job, bootstrap ou request path;
- usar Portal;
- usar dados reais;
- usar usuario real;
- usar unidade real;
- gerar trafego real;
- executar rollback real.

Registrar que se algum dia evidencia operacional real for necessaria, isso exigira fase propria, autorizacao explicita propria, rollback proprio, escopo proprio, gates proprios e validacao propria.

### 9.4 Evidencia de autorizacao textual

Registrar que qualquer autorizacao futura precisaria ser:

- textual;
- explicita;
- especifica;
- limitada;
- registrada no status da migracao;
- vinculada a uma fase;
- vinculada a um escopo;
- vinculada a um rollback;
- vinculada a criterios de entrada e saida;
- revogavel em caso de gate vermelho, ambiguidade ou desvio de escopo.

Registrar que autorizacao generica nao e suficiente.

### 9.5 Resultado das evidencias

Registrar:

- authorizationEvidenceDefined=true;
- authorizationScopeDefined permanece true;
- authorizationActorsDefined permanece true;
- authorizationContractOpened permanece true;
- explicitAuthorizationDefined permanece false;
- preparationStillForbidden permanece true;
- executionStillForbidden permanece true;
- operationalSurfaceStillForbidden permanece true;
- candidateStillSynthetic permanece true;
- nonOperationalPreserved permanece true;
- fallbackRequired permanece true;
- blockedReasons permanece [].

Interpretacao obrigatoria:

- authorizationEvidenceDefined=true significa apenas que as evidencias exigidas antes de qualquer autorizacao futura foram definidas documentalmente.
- authorizationEvidenceDefined=true nao autoriza preparacao operacional concreta.
- authorizationEvidenceDefined=true nao autoriza execucao.
- authorizationEvidenceDefined=true nao autoriza rollback real.
- authorizationEvidenceDefined=true nao autoriza coleta de evidencia operacional real.
- authorizationEvidenceDefined=true nao autoriza criar comando, script, caller real, rota, CLI, job, bootstrap ou request path.
- authorizationEvidenceDefined=true nao autoriza alterar registry real, allowlist real ou roteamento.
- authorizationEvidenceDefined=true nao autoriza abrir tenant DB real.
- authorizationEvidenceDefined=true nao autoriza envolver Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

## 10. Contrato de autorizacao explicita

Registrar que a Fase P define o formato minimo de autorizacao explicita valida para qualquer avanco futuro. A definicao do contrato de autorizacao explicita nao concede autorizacao concreta agora.

### 10.1 Forma minima da autorizacao

Registrar que qualquer autorizacao futura precisa conter, textualmente:

- fase autorizada;
- objetivo autorizado;
- escopo autorizado;
- limites nao autorizados;
- responsavel/autorizador;
- rollback exigido;
- evidencias exigidas;
- criterios de entrada;
- criterios de saida;
- confirmacao de que autorizacao generica nao basta;
- confirmacao de que autorizacao para documentar nao equivale a autorizacao para preparar;
- confirmacao de que autorizacao para preparar nao equivale a autorizacao para executar.

### 10.2 Autorizacoes invalidas

Registrar que sao invalidas:

- autorizacao implicita;
- autorizacao presumida por teste verde;
- autorizacao presumida por commit;
- autorizacao presumida por push;
- autorizacao presumida por documentacao completa;
- autorizacao generica como "pode seguir";
- autorizacao sem escopo;
- autorizacao sem limites;
- autorizacao sem rollback proprio;
- autorizacao sem evidencias proprias;
- autorizacao que misture preparar e executar;
- autorizacao que envolva Portal, usuario real, unidade real, dados reais, trafego real ou PostgreSQL fora de fase propria.

### 10.3 Autorizacao documental versus preparacao versus execucao

Registrar:

- autorizacao para documentar permite apenas alterar documentacao dentro de escopo;
- autorizacao para preparar, se algum dia existir, exigira fase propria e nao podera ser inferida da Fase P;
- autorizacao para executar, se algum dia existir, exigira fase propria, rollback proprio, evidencias proprias, escopo proprio, gates proprios, validacao propria e comando/fluxo proprio aprovado;
- nenhuma autorizacao futura pode ser retroativa;
- nenhuma autorizacao futura pode transformar commits anteriores em execucao autorizada.

### 10.4 Condicoes de revogacao ou bloqueio

Registrar que qualquer autorizacao futura deve ser considerada revogada ou bloqueada se houver:

- gate vermelho;
- ambiguidade;
- alteracao fora do escopo;
- arquivo operacional alterado sem autorizacao propria;
- divergencia entre status e documento canonico;
- falha de teste;
- worktree suja inesperada;
- tentativa de usar dados reais;
- tentativa de usar usuario real;
- tentativa de usar unidade real;
- tentativa de usar Portal;
- tentativa de envolver PostgreSQL;
- tentativa de executar rollback real fora de fase propria.

### 10.5 Resultado do contrato de autorizacao

Registrar:

- explicitAuthorizationDefined=true;
- authorizationEvidenceDefined permanece true;
- authorizationScopeDefined permanece true;
- authorizationActorsDefined permanece true;
- authorizationContractOpened permanece true;
- preparationStillForbidden permanece true;
- executionStillForbidden permanece true;
- operationalSurfaceStillForbidden permanece true;
- candidateStillSynthetic permanece true;
- nonOperationalPreserved permanece true;
- fallbackRequired permanece true;
- blockedReasons permanece [].

Interpretacao obrigatoria:

- explicitAuthorizationDefined=true significa apenas que o formato e as condicoes de uma autorizacao explicita valida foram definidos documentalmente.
- explicitAuthorizationDefined=true nao significa que uma autorizacao concreta foi concedida.
- explicitAuthorizationDefined=true nao autoriza preparacao operacional concreta.
- explicitAuthorizationDefined=true nao autoriza execucao.
- explicitAuthorizationDefined=true nao autoriza rollback real.
- explicitAuthorizationDefined=true nao autoriza coleta de evidencia operacional real.
- explicitAuthorizationDefined=true nao autoriza criar comando, script, caller real, rota, CLI, job, bootstrap ou request path.
- explicitAuthorizationDefined=true nao autoriza alterar registry real, allowlist real ou roteamento.
- explicitAuthorizationDefined=true nao autoriza abrir tenant DB real.
- explicitAuthorizationDefined=true nao autoriza envolver Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

## 11. Interpretacao obrigatoria

Registrar:

- authorizationContractOpened=true nao autoriza execucao.
- authorizationContractOpened=true nao autoriza preparacao operacional concreta.
- authorizationContractOpened=true nao autoriza coleta de evidencia operacional real.
- authorizationContractOpened=true nao autoriza rollback real.
- authorizationContractOpened=true nao autoriza criar comando, script, caller real, rota, CLI, job, bootstrap ou request path.
- authorizationContractOpened=true nao autoriza alterar registry real, allowlist real ou roteamento.
- authorizationContractOpened=true nao autoriza abrir tenant DB real.
- authorizationContractOpened=true nao autoriza envolver Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.
- authorizationContractOpened=true nao abre fase posterior automaticamente.

## 12. Criterio de avanco da Fase P

Registrar que a Fase P so podera avancar quando forem definidos, documentalmente:

- atores/responsaveis pela autorizacao;
- escopo autorizavel;
- limites nao autorizaveis;
- evidencias exigidas;
- gates de bloqueio;
- interpretacao obrigatoria.

Registrar que mesmo um contrato completo nao autoriza execucao nem preparacao operacional concreta.