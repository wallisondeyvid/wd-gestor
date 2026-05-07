# Fase Z - Preparacao Operacional Concreta Sintetica Manual Controlada

## 1. Status

Aberta.

## 2. Natureza da fase

Registrar que a Fase Z e:

- concreta em intencao;
- sintetica;
- manual;
- controlada;
- nao produtiva;
- dependente de autorizacao explicita;
- dependente de aprovacao individual de comando;
- posterior a Fase Y;
- primeira fase orientada ao primeiro ato concreto sintetico;
- incapaz de executar qualquer ato concreto por sua simples abertura.

Registrar que a Fase Z representa a transicao da cadeia documental para uma preparacao concreta futura, mas a abertura desta fase ainda nao executa essa preparacao.

Registrar que a Fase Z nao deve reabrir cadeia longa de contratos redundantes. A Fase X e a Fase Y sao a base consolidada.

## 3. Base documental

Registrar:

- Fase anterior: Fase Y
- Base publicada: 182985e docs(tenant): completa validacao final da fase y
- Documento canonico anterior: docs/tenant-phase-y-operational-preparation-preauthorization-contract.md
- Base consolidada: Fase X e Fase Y
- Ledger global: docs/migration-status.md
- HEAD e origin sincronizados antes da abertura
- Worktree limpa antes da abertura

## 4. Objetivo

Registrar que o objetivo da Fase Z e preparar o primeiro ato concreto sintetico/manual/controlado futuro, em microcorte proprio, sem executar esse ato na abertura da fase.

Registrar que a Fase Z deve avancar para um primeiro microcorte concreto, limitado e auditavel, com:

- comando completo visivel;
- autorizacao explicita do usuario;
- aprovacao individual do comando;
- candidato estritamente sintetico;
- ambiente nao produtivo;
- ausencia de Portal;
- ausencia de dados reais;
- ausencia de trafego real;
- ausencia de usuario real;
- ausencia de unidade real;
- ausencia de PostgreSQL;
- ausencia de tenant DB real;
- fallback obrigatorio para baseConnection;
- plano de rollback respeitado;
- plano de evidencia sintetica respeitado;
- criterio de parada definido;
- criterio de sucesso definido;
- criterio de falha definido.

Registrar que a abertura da Fase Z nao executa esse primeiro ato concreto.

## 5. Gates iniciais da Fase Z

Registrar:

- syntheticManualOperationalPreparationPhaseOpened=true
- firstConcreteSyntheticActionDefined=true
- firstConcreteSyntheticCommandApproved=true
- firstConcreteSyntheticActionExecuted=false
- rollbackRealExecuted=false
- operationalEvidenceRealCollected=false
- operationalSurfaceCreated=false
- candidateStillSynthetic=true
- nonProductionRequired=true
- explicitUserAuthorizationRequired=true
- explicitCommandApprovalRequired=true
- fallbackRequired=true
- portalStillForbidden=true
- realDataStillForbidden=true
- realTrafficStillForbidden=true
- realUserStillForbidden=true
- realUnitStillForbidden=true
- postgresStillForbidden=true
- tenantDbRealStillForbidden=true
- blockedReasons=[]

## 6. Interpretacao dos gates iniciais

Registrar:

- syntheticManualOperationalPreparationPhaseOpened=true porque a Fase Z foi aberta como fase concreta sintetica/manual/controlada;
- firstConcreteSyntheticActionDefined=true porque o primeiro ato concreto sintetico/manual/controlado futuro foi definido documentalmente neste microcorte;
- firstConcreteSyntheticCommandApproved=true porque o comando candidato do primeiro ato concreto sintetico/manual/controlado foi aprovado documentalmente neste microcorte;
- firstConcreteSyntheticActionExecuted=false permanece false porque nenhuma acao concreta foi executada;
- aprovacao documental do comando nao executa o comando;
- aprovacao documental do comando nao substitui microcorte futuro de execucao;
- aprovacao documental do comando nao autoriza alteracao de arquivos.
- rollbackRealExecuted=false porque nenhum rollback real foi executado;
- operationalEvidenceRealCollected=false porque nenhuma evidencia operacional real foi coletada;
- operationalSurfaceCreated=false porque nenhuma superficie operacional foi criada;
- candidateStillSynthetic=true porque qualquer candidato futuro deve permanecer estritamente sintetico;
- nonProductionRequired=true porque qualquer preparacao futura deve permanecer em ambiente nao produtivo;
- explicitUserAuthorizationRequired=true porque autorizacao explicita futura do usuario segue obrigatoria;
- explicitCommandApprovalRequired=true porque qualquer comando futuro dependera de aprovacao individual explicita;
- fallbackRequired=true porque fallback para baseConnection continua obrigatorio;
- portalStillForbidden=true porque Portal permanece proibido;
- realDataStillForbidden=true porque dados reais permanecem proibidos;
- realTrafficStillForbidden=true porque trafego real permanece proibido;
- realUserStillForbidden=true porque usuario real permanece proibido;
- realUnitStillForbidden=true porque unidade real permanece proibida;
- postgresStillForbidden=true porque PostgreSQL permanece fora do escopo atual;
- tenantDbRealStillForbidden=true porque tenant DB real permanece proibida;
- blockedReasons=[] significa apenas ausencia de bloqueio documental para abrir a Fase Z, nao autorizacao para executar, publicar, ativar ou plugar qualquer coisa.

## 7. Primeiro ato concreto sintetico/manual/controlado futuro

Registrar que o primeiro ato concreto sintetico/manual/controlado futuro da Fase Z sera:

- auditoria manual;
- read-only;
- local;
- nao produtiva;
- limitada a listagem e inspecao textual;
- sem alteracao de arquivos;
- sem execucao operacional real;
- sem criacao de superficie operacional.

Registrar finalidade:

- confirmar estado do repositorio antes de qualquer preparacao concreta futura;
- confirmar presenca dos artefatos de tenant registry/manual pilot;
- confirmar presenca dos testes arquiteturais relacionados;
- confirmar ausencia de alteracao em codigo;
- confirmar que qualquer preparacao futura ainda dependera de autorizacao explicita;
- produzir evidencia sintetica textual e local;
- preservar fallback para baseConnection.

Registrar comando candidato futuro, aprovado documentalmente e ainda nao executado:

```powershell
git status -sb
git log --oneline --decorate -8
Get-ChildItem .\tests\architecture\*unitDatabaseRegistry* -File | Select-Object Name
Get-ChildItem .\server\config -File | Select-Object Name
Get-ChildItem .\server\db -File | Select-Object Name
```

Registrar que o comando candidato:

- foi aprovado documentalmente neste microcorte;
- nao foi executado neste microcorte;
- devera ser exibido novamente antes de qualquer execucao futura;
- dependera de autorizacao explicita do usuario;
- dependera de aprovacao individual do comando;
- e somente leitura;
- nao altera arquivos;
- nao altera codigo;
- nao altera testes;
- nao altera package.json;
- nao altera scripts;
- nao altera rotas;
- nao toca em src;
- nao cria caller;
- nao cria rota;
- nao cria CLI;
- nao cria script persistente;
- nao cria job;
- nao cria bootstrap;
- nao pluga em request path;
- nao abre tenant DB real;
- nao altera registry real;
- nao altera allowlist real;
- nao altera roteamento real;
- nao usa Portal;
- nao usa dados reais;
- nao usa trafego real;
- nao usa usuario real;
- nao usa unidade real;
- nao usa PostgreSQL;
- nao executa rollback real;
- nao coleta evidencia operacional real;
- nao cria superficie operacional real;
- nao faz push.

Registrar criterios:

Criterio de parada:

- qualquer comando diferente do listado bloqueia avanco;
- qualquer necessidade de escrita bloqueia avanco;
- qualquer referencia a dado real, trafego real, usuario real, unidade real, Portal, PostgreSQL ou tenant DB real bloqueia avanco;
- qualquer ambiguidade degrada para nao executar.

Criterio de sucesso:

- comando candidato permanece read-only;
- superficies afetadas permanecem apenas repositorio local e saida textual;
- nenhum arquivo e alterado;
- nenhuma superficie operacional e criada;
- nenhuma execucao operacional real ocorre.

Criterio de falha:

- qualquer alteracao de arquivo;
- qualquer tentativa de executar comando nao listado;
- qualquer acesso a dado real;
- qualquer uso de Portal;
- qualquer uso de PostgreSQL;
- qualquer abertura de tenant DB real;
- qualquer criacao de rota, caller, CLI, script, job, bootstrap ou request path.

Registrar interpretacao obrigatoria:

- definicao do primeiro ato concreto sintetico nao autoriza sua execucao;
- definicao do primeiro ato concreto sintetico nao aprova comando;
- definicao do primeiro ato concreto sintetico nao coleta evidencia operacional real;
- definicao do primeiro ato concreto sintetico nao cria superficie operacional;
- definicao do primeiro ato concreto sintetico nao altera codigo;
- definicao do primeiro ato concreto sintetico nao altera testes;
- definicao do primeiro ato concreto sintetico nao autoriza push;
- execucao futura dependera de novo microcorte, comando completo visivel e autorizacao explicita do usuario.

## 8. Aprovacao documental do comando candidato

Registrar que o comando candidato abaixo foi aprovado documentalmente para execucao futura em microcorte proprio, mas nao foi executado neste microcorte:

```powershell
git status -sb
git log --oneline --decorate -8
Get-ChildItem .\tests\architecture\*unitDatabaseRegistry* -File | Select-Object Name
Get-ChildItem .\server\config -File | Select-Object Name
Get-ChildItem .\server\db -File | Select-Object Name
```

Registrar que a aprovacao documental confirma:

- comando completo visivel;
- comando limitado a leitura/listagem;
- comando local;
- comando nao produtivo;
- comando sem alteracao de arquivos;
- comando sem alteracao de codigo;
- comando sem alteracao de testes;
- comando sem alteracao de package.json;
- comando sem alteracao de scripts;
- comando sem alteracao de rotas;
- comando sem toque em src;
- comando sem criacao de caller;
- comando sem criacao de rota;
- comando sem criacao de CLI;
- comando sem criacao de script persistente;
- comando sem criacao de job;
- comando sem criacao de bootstrap;
- comando sem plug em request path;
- comando sem abertura de tenant DB real;
- comando sem alteracao de registry real;
- comando sem alteracao de allowlist real;
- comando sem alteracao de roteamento real;
- comando sem uso de Portal;
- comando sem uso de dados reais;
- comando sem uso de trafego real;
- comando sem uso de usuario real;
- comando sem uso de unidade real;
- comando sem uso de PostgreSQL;
- comando sem rollback real;
- comando sem evidencia operacional real;
- comando sem criacao de superficie operacional real;
- comando sem push.

Registrar que a execucao futura devera:

- ocorrer em novo microcorte;
- repetir o comando completo antes da execucao;
- confirmar autorizacao explicita do usuario imediatamente antes da execucao;
- parar se houver qualquer ambiguidade;
- parar se houver qualquer necessidade de escrita;
- parar se qualquer comando diferente for necessario;
- registrar apenas evidencia sintetica textual;
- preservar fallback para baseConnection.

Registrar interpretacao obrigatoria:

- aprovacao documental do comando nao executa comando;
- aprovacao documental do comando nao coleta evidencia operacional real;
- aprovacao documental do comando nao cria superficie operacional;
- aprovacao documental do comando nao altera codigo;
- aprovacao documental do comando nao altera testes;
- aprovacao documental do comando nao autoriza push;
- execucao futura dependera de novo microcorte.

## 9. Bloqueios obrigatorios da abertura da Fase Z

Registrar que a abertura da Fase Z bloqueia expressamente:

- execucao neste microcorte;
- piloto real;
- rollback real;
- evidencia operacional real;
- superficie operacional real;
- caller real;
- rota real;
- CLI real;
- script real;
- job real;
- bootstrap real;
- request path real;
- alteracao em src;
- alteracao em codigo;
- alteracao em testes;
- alteracao em package.json;
- alteracao em scripts;
- alteracao em rotas;
- alteracao em registry real;
- alteracao em allowlist real;
- abertura de tenant DB real;
- alteracao de roteamento real;
- uso de Portal;
- uso de dados reais;
- uso de trafego real;
- uso de usuario real;
- uso de unidade real;
- uso de PostgreSQL;
- uso de segredo, token ou credencial real;
- criacao ou alteracao de variavel de ambiente operacional;
- abertura de conexao real;
- abertura de banco real;
- push;
- abertura automatica de fase posterior.

## 10. Criterio de avanco da Fase Z

Registrar que a Fase Z devera avancar diretamente para a definicao do primeiro ato concreto sintetico/manual/controlado, em microcorte proprio.

Registrar que o proximo microcorte natural nao deve ser novo contrato redundante, mas sim:

- definir exatamente qual sera o primeiro ato concreto sintetico;
- mostrar o comando completo antes de qualquer execucao;
- declarar arquivos/diretorios/superficies afetadas;
- declarar que nao havera Portal, dados reais, trafego real, usuario real, unidade real, PostgreSQL ou tenant DB real;
- declarar que fallback para baseConnection sera preservado;
- declarar criterio de parada, sucesso e falha;
- declarar plano de rollback aplicavel;
- declarar evidencia sintetica esperada;
- pedir autorizacao explicita do usuario antes de executar.

Registrar que nenhum desses passos e automatico.

