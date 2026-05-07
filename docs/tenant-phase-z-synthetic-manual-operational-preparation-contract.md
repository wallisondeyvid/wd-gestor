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
- firstConcreteSyntheticActionDefined=false
- firstConcreteSyntheticCommandApproved=false
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
- firstConcreteSyntheticActionDefined=false porque o primeiro ato concreto sintetico ainda nao foi definido;
- firstConcreteSyntheticCommandApproved=false porque nenhum comando concreto foi apresentado, autorizado ou aprovado;
- firstConcreteSyntheticActionExecuted=false porque nenhuma acao concreta foi executada;
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

## 7. Bloqueios obrigatorios da abertura da Fase Z

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

## 8. Criterio de avanco da Fase Z

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

