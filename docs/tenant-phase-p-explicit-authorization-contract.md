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
- explicitAuthorizationDefined=false
- authorizationActorsDefined=true
- authorizationScopeDefined=false
- authorizationEvidenceDefined=false
- preparationStillForbidden=true
- executionStillForbidden=true
- operationalSurfaceStillForbidden=true
- candidateStillSynthetic=true
- nonOperationalPreserved=true
- fallbackRequired=true
- blockedReasons=[]

Explicar:

- authorizationContractOpened=true porque a Fase P foi aberta documentalmente.
- explicitAuthorizationDefined=false porque o contrato de autorizacao explicita ainda nao foi definido.
- authorizationActorsDefined=true porque os atores/responsaveis documentais pela autorizacao explicita foram definidos neste microcorte sem autorizar qualquer preparacao ou execucao.
- authorizationScopeDefined=false porque o escopo autorizavel ainda nao foi definido.
- authorizationEvidenceDefined=false porque as evidencias exigidas ainda nao foram definidas.
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
- authorizationScopeDefined permanece false;
- authorizationEvidenceDefined permanece false;
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

## 8. Interpretacao obrigatoria

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

## 9. Criterio de avanco da Fase P

Registrar que a Fase P so podera avancar quando forem definidos, documentalmente:

- atores/responsaveis pela autorizacao;
- escopo autorizavel;
- limites nao autorizaveis;
- evidencias exigidas;
- gates de bloqueio;
- interpretacao obrigatoria.

Registrar que mesmo um contrato completo nao autoriza execucao nem preparacao operacional concreta.