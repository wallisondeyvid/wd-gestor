# Fase M - Contrato de Preparacao para Execucao Manual Controlada Nao Produtiva do Candidato Sintetico Multi-DB

## 1. Status

- Aberta.

## 2. Natureza da fase

- A Fase M e documental, preparatoria e nao operacional.
- A Fase M nao executa piloto.
- A Fase M nao abre tenant DB real.
- A Fase M nao altera registry real.
- A Fase M nao altera allowlist real.
- A Fase M nao cria caller real.
- A Fase M nao cria rota, CLI, script, job, bootstrap ou request path.
- A Fase M nao envolve Portal, dados reais, trafego real, usuario real ou unidade real.
- A Fase M nao envolve PostgreSQL.

## 3. Origem

Registrar que a Fase M nasce do encerramento da Fase L em:

59d4f36 docs(tenant): registra encerramento da fase l no status

Registrar que a Fase L concluiu:

- decisionContractReady=true;
- candidateStillSynthetic=true;
- manualOnlyPreserved=true;
- nonOperationalPreserved=true;
- fallbackPreserved=true;
- rollbackPreconditionsPreserved=true;
- noOperationalSurfaceCreated=true;
- baselineGreen=true;
- blockedReasons=[].

## 4. Candidato sintetico herdado

Registrar exatamente o candidato herdado das Fases J, K e L:

- targetId: fase-j-synthetic-unit-candidate-001
- unidadeId: 0000000000000000000000a1
- dbName: wdgestor_unit_0000000000000000000000a1
- databaseKey: wdgestor_unit_0000000000000000000000a1
- plannedAllowlist:
  - 0000000000000000000000a1
- targetKind: syntheticUnit
- environment: non-production
- dataClass: discardable
- trafficClass: none
- userClass: none
- portalExposure: none
- dedicatedDatabase: true

## 5. Objetivo da Fase M

Definir, de forma documental, as pre-condicoes, limites, artefatos e gates que seriam necessarios para uma fase posterior eventualmente autorizar uma execucao manual controlada, nao produtiva e sintetica.

Deixar claro:

- A Fase M prepara contrato, nao execucao.
- A Fase M pode descrever comandos futuros em termos conceituais, mas nao deve criar nem executar comandos operacionais.
- A Fase M pode definir checklists futuros, mas nao deve aplicar alteracao operacional.
- A Fase M pode definir rollback futuro, mas nao deve acionar rollback.
- A Fase M pode definir evidencias esperadas, mas nao deve coletar evidencia operacional real.

## 6. Nao objetivos

Listar explicitamente:

- executar piloto;
- criar caller real;
- criar rota;
- criar CLI;
- criar script;
- criar job;
- criar bootstrap;
- plugar em request path;
- alterar registry real;
- alterar allowlist real;
- abrir tenant DB real;
- mudar roteamento;
- envolver Portal;
- envolver dados reais;
- envolver trafego real;
- envolver usuario real;
- envolver unidade real;
- envolver PostgreSQL;
- remover fallback para baseConnection;
- transformar harness de teste em piloto real;
- reaproveitar package.json como autorizacao operacional.

## 7. Principios de preparacao

Incluir:

- qualquer ambiguidade degrada para nao executar;
- qualquer falha de gate bloqueia avanco;
- fallback para baseConnection permanece obrigatorio;
- rollback deve ser definido antes de qualquer execucao futura;
- allowlist deve permanecer unitaria, explicita e sintetica;
- nenhuma superficie operacional pode ser criada por oportunidade;
- nenhuma execucao pode ocorrer sem fase posterior explicita;
- nenhuma fase posterior pode ser presumida como autorizada pela Fase M.

## 8. Gates iniciais da Fase M

Criar gates iniciais todos em estado conservador:

- preparationContractReady: false
- candidateStillSynthetic: true
- nonOperationalPreserved: true
- manualOnlyPreserved: true
- noOperationalSurfaceCreated: true
- fallbackPreserved: true
- rollbackPlanDefined: false
- evidencePlanDefined: false
- executionStillForbidden: true
- blockedReasons: []

Explicar:

- preparationContractReady=false porque o contrato ainda acabou de ser aberto.
- rollbackPlanDefined=false porque o plano de rollback ainda sera definido em microcorte posterior.
- evidencePlanDefined=false porque o plano de evidencias ainda sera definido em microcorte posterior.
- executionStillForbidden=true porque nenhuma execucao esta autorizada na Fase M.

## 9. Limite semantico da Fase M

Registrar:

- Preparar contrato nao e preparar operacao.
- Planejar rollback nao e executar rollback.
- Planejar evidencias nao e coletar evidencias reais.
- Descrever comando futuro nao e autorizar comando.
- Gate verde nao autoriza execucao.
- Fase posterior possivel nao significa fase posterior aberta.
- A Fase M so pode encerrar com recomendacao documental.

## 10. Resultado inicial

Registrar:

- Status: Aberta.
- Resultado inicial: contrato de preparacao ainda nao consolidado.
- preparationContractReady=false.
- blockedReasons=[].
- Execucao continua proibida.

## 11. Interpretacao obrigatoria

Registrar:

- A Fase M nao autoriza execucao.
- A Fase M nao autoriza preparacao operacional concreta.
- A Fase M nao autoriza caller real.
- A Fase M nao autoriza rota, CLI, script, job, bootstrap ou request path.
- A Fase M nao autoriza alteracao de registry real.
- A Fase M nao autoriza alteracao de allowlist real.
- A Fase M nao autoriza abertura de tenant DB real.
- A Fase M nao autoriza mudanca de roteamento.
- A Fase M nao envolve Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.
