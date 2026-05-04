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
- rollbackPlanDefined: true
- evidencePlanDefined: false
- executionStillForbidden: true
- blockedReasons: []

Explicar:

- preparationContractReady=false porque o contrato ainda acabou de ser aberto.
- rollbackPlanDefined=true porque o plano documental de rollback foi definido neste microcorte.
- evidencePlanDefined=false porque o plano de evidencias ainda sera definido em microcorte posterior.
- executionStillForbidden=true porque nenhuma execucao esta autorizada na Fase M.

## 9. Plano documental de rollback

Registrar que o plano de rollback da Fase M e documental e preparatorio.

### 9.1 Escopo do rollback

- O rollback descrito nesta fase e apenas um contrato documental.
- Nenhum rollback e executado na Fase M.
- Nenhum comando de rollback e criado na Fase M.
- Nenhum script de rollback e criado na Fase M.
- Nenhum registry real e alterado.
- Nenhuma allowlist real e alterada.
- Nenhum tenant DB real e aberto ou removido.
- Nenhum roteamento e alterado.

### 9.2 Estado seguro esperado

Registrar que qualquer fase posterior que venha a executar algo devera conseguir retornar para:

- uso exclusivo de `baseConnection`;
- ausencia de allowlist real ativa para o candidato;
- ausencia de caller real conectado ao owner manual;
- ausencia de caller real conectado ao entrypoint manual;
- ausencia de rota, CLI, script, job, bootstrap ou request path operacional;
- nenhuma dependencia de tenant DB real;
- nenhuma exposicao ao Portal;
- nenhum dado real envolvido;
- nenhum trafego real envolvido;
- nenhum usuario real envolvido;
- nenhuma unidade real envolvida.

### 9.3 Pre-condicoes para rollback futuro

Registrar que, antes de qualquer execucao futura em fase posterior, o rollback devera ter:

- ponto de retorno documental definido;
- estado esperado antes da execucao registrado;
- estado esperado depois da reversao registrado;
- lista explicita de artefatos que poderiam ser revertidos;
- criterio de sucesso do rollback;
- criterio de falha do rollback;
- decisao explicita de interromper em caso de falha;
- validacao minima pos-rollback;
- confirmacao de que `resolveConnection` continua caindo para `baseConnection`;
- confirmacao de que nenhuma unidade real foi envolvida.

### 9.4 Gatilhos de rollback futuro

Registrar como gatilhos obrigatorios para uma eventual fase posterior:

- qualquer falha de gate;
- qualquer ambiguidade sobre unidade;
- qualquer tentativa de usar unidade real;
- qualquer tentativa de envolver Portal;
- qualquer tentativa de envolver dado real;
- qualquer tentativa de envolver trafego real;
- qualquer tentativa de envolver usuario real;
- qualquer alteracao nao planejada em registry real;
- qualquer alteracao nao planejada em allowlist real;
- qualquer ausencia de fallback para `baseConnection`;
- qualquer criacao acidental de caller real;
- qualquer criacao acidental de rota, CLI, script, job, bootstrap ou request path;
- qualquer aproximacao de PostgreSQL;
- qualquer divergencia de baseline.

### 9.5 Resultado do plano de rollback

Registrar:

- rollbackPlanDefined: true;
- preparationContractReady permanece false;
- executionStillForbidden permanece true;
- blockedReasons permanece [].

Interpretacao obrigatoria:

- rollbackPlanDefined=true significa apenas que o plano documental foi definido.
- rollbackPlanDefined=true nao autoriza execucao.
- rollbackPlanDefined=true nao autoriza preparacao operacional concreta.
- rollbackPlanDefined=true nao autoriza criar comando.
- rollbackPlanDefined=true nao autoriza criar script.
- rollbackPlanDefined=true nao autoriza alterar registry real.
- rollbackPlanDefined=true nao autoriza alterar allowlist real.
- rollbackPlanDefined=true nao autoriza abrir tenant DB real.
- rollbackPlanDefined=true nao autoriza mudar roteamento.

## 10. Limite semantico da Fase M

Registrar:

- Preparar contrato nao e preparar operacao.
- Planejar rollback nao e executar rollback.
- Planejar evidencias nao e coletar evidencias reais.
- Descrever comando futuro nao e autorizar comando.
- Gate verde nao autoriza execucao.
- Fase posterior possivel nao significa fase posterior aberta.
- A Fase M so pode encerrar com recomendacao documental.

## 11. Resultado inicial

Registrar:

- Status: Aberta.
- Resultado inicial: contrato de preparacao ainda nao consolidado.
- preparationContractReady=false.
- blockedReasons=[].
- Execucao continua proibida.

## 12. Interpretacao obrigatoria

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
