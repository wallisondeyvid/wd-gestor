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

- preparationContractReady: true
- candidateStillSynthetic: true
- nonOperationalPreserved: true
- manualOnlyPreserved: true
- noOperationalSurfaceCreated: true
- fallbackPreserved: true
- rollbackPlanDefined: true
- evidencePlanDefined: true
- criteriosDefined: true
- executionStillForbidden: true
- blockedReasons: []

Explicar:

- preparationContractReady=true porque o checklist documental da Fase M foi aplicado neste microcorte.
- rollbackPlanDefined=true porque o plano documental de rollback foi definido neste microcorte.
- evidencePlanDefined=true porque o plano documental de evidencias foi definido neste microcorte.
- criteriosDefined=true porque os criterios documentais de preparacao foram definidos neste microcorte.
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

## 10. Plano documental de evidencias

Registrar que o plano de evidencias da Fase M e documental e preparatorio.

### 10.1 Escopo das evidencias

- As evidencias descritas nesta fase sao apenas requisitos documentais para uma fase posterior.
- Nenhuma evidencia operacional real e coletada na Fase M.
- Nenhuma conexao tenant real e aberta na Fase M.
- Nenhum registry real e lido ou alterado na Fase M.
- Nenhuma allowlist real e lida ou alterada na Fase M.
- Nenhum dado real e consultado.
- Nenhum trafego real e observado.
- Nenhum usuario real e envolvido.
- Nenhuma unidade real e envolvida.
- Nenhum artefato operacional novo e criado.

### 10.2 Evidencias documentais minimas exigidas

Registrar que qualquer fase posterior que pretenda cogitar execucao manual controlada devera ter, antes de qualquer execucao:

- documento da fase posterior aberto explicitamente;
- objetivo da fase posterior definido;
- candidato sintetico confirmado;
- allowlist planejada unitaria, explicita e sintetica;
- rollback definido antes da execucao;
- gates da fase posterior definidos;
- blockedReasons inicial registrado;
- baseline curta verde antes da execucao;
- confirmacao documental de que `resolveConnection` preserva fallback para `baseConnection`;
- confirmacao documental de ausencia de caller real;
- confirmacao documental de ausencia de rota, CLI, script, job, bootstrap ou request path;
- confirmacao documental de ausencia de Portal;
- confirmacao documental de ausencia de dados reais;
- confirmacao documental de ausencia de trafego real;
- confirmacao documental de ausencia de usuario real;
- confirmacao documental de ausencia de unidade real;
- confirmacao documental de ausencia de PostgreSQL.

### 10.3 Evidencias proibidas na Fase M

Registrar como proibido na Fase M:

- coletar log de execucao real;
- coletar resultado de conexao tenant real;
- coletar resultado de abertura de tenant DB real;
- coletar resultado de alteracao de registry real;
- coletar resultado de alteracao de allowlist real;
- coletar evidencia de rota operacional;
- coletar evidencia de CLI operacional;
- coletar evidencia de script operacional;
- coletar evidencia de job operacional;
- coletar evidencia de bootstrap operacional;
- coletar evidencia de request path operacional;
- coletar evidencia envolvendo Portal;
- coletar evidencia envolvendo dados reais;
- coletar evidencia envolvendo trafego real;
- coletar evidencia envolvendo usuario real;
- coletar evidencia envolvendo unidade real;
- coletar evidencia envolvendo PostgreSQL.

### 10.4 Evidencias esperadas apenas em fase posterior

Registrar que uma fase posterior, se explicitamente aberta, podera definir evidencias esperadas para execucao manual controlada, mas somente depois de:

- contrato proprio aprovado;
- gates proprios definidos;
- rollback proprio confirmado;
- candidateStillSynthetic=true;
- executionStillForbidden revisado explicitamente na fase posterior;
- ausencia de blockedReasons;
- validacao curta verde;
- autorizacao explicita do usuario para aquela fase.

### 10.5 Resultado do plano de evidencias

Registrar:

- evidencePlanDefined: true;
- rollbackPlanDefined permanece true;
- preparationContractReady permanece false;
- executionStillForbidden permanece true;
- blockedReasons permanece [].

Interpretacao obrigatoria:

- evidencePlanDefined=true significa apenas que o plano documental de evidencias foi definido.
- evidencePlanDefined=true nao autoriza execucao.
- evidencePlanDefined=true nao autoriza coleta de evidencia operacional real.
- evidencePlanDefined=true nao autoriza abrir conexao tenant real.
- evidencePlanDefined=true nao autoriza ler ou alterar registry real.
- evidencePlanDefined=true nao autoriza ler ou alterar allowlist real.
- evidencePlanDefined=true nao autoriza criar comando.
- evidencePlanDefined=true nao autoriza criar script.
- evidencePlanDefined=true nao autoriza criar caller real.
- evidencePlanDefined=true nao autoriza criar rota, CLI, job, bootstrap ou request path.
- evidencePlanDefined=true nao autoriza envolver Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

## 11. Criterios documentais de preparacao

Registrar que os criterios da Fase M sao documentais, preparatorios e nao operacionais.

### 11.1 Criterios para considerar o contrato de preparacao pronto

Registrar que preparationContractReady somente podera ser true em microcorte posterior se todos os itens abaixo estiverem satisfeitos:

- candidato sintetico herdado preservado sem alteracao;
- rollbackPlanDefined=true;
- evidencePlanDefined=true;
- executionStillForbidden=true;
- blockedReasons=[];
- fallback para `baseConnection` preservado como requisito obrigatorio;
- ausencia de caller real preservada;
- ausencia de rota, CLI, script, job, bootstrap ou request path preservada;
- ausencia de alteracao em registry real preservada;
- ausencia de alteracao em allowlist real preservada;
- ausencia de tenant DB real aberto preservada;
- ausencia de Portal preservada;
- ausencia de dados reais preservada;
- ausencia de trafego real preservada;
- ausencia de usuario real preservada;
- ausencia de unidade real preservada;
- ausencia de PostgreSQL preservada;
- baseline curta verde antes do checklist final;
- sem comandos executaveis criados;
- sem scripts operacionais criados;
- sem qualquer preparacao operacional concreta.

### 11.2 Criterios para manter o contrato como nao pronto

Registrar que preparationContractReady devera permanecer false se qualquer um dos itens abaixo ocorrer:

- rollbackPlanDefined=false;
- evidencePlanDefined=false;
- executionStillForbidden=false dentro da Fase M;
- blockedReasons diferente de [];
- duvida sobre o candidato sintetico;
- duvida sobre unidade;
- qualquer mencao ambigua a unidade real;
- qualquer indicio de caller real;
- qualquer indicio de rota, CLI, script, job, bootstrap ou request path;
- qualquer leitura ou alteracao de registry real;
- qualquer leitura ou alteracao de allowlist real;
- qualquer abertura de tenant DB real;
- qualquer envolvimento de Portal;
- qualquer envolvimento de dados reais;
- qualquer envolvimento de trafego real;
- qualquer envolvimento de usuario real;
- qualquer envolvimento de unidade real;
- qualquer aproximacao de PostgreSQL;
- baseline curta falhando;
- tentativa de transformar documentacao em execucao.

### 11.3 Criterios de bloqueio imediato

Registrar que a Fase M devera ser considerada bloqueada se ocorrer:

- criacao de caller real;
- criacao de rota;
- criacao de CLI;
- criacao de script operacional;
- criacao de job;
- criacao de bootstrap;
- ligacao em request path;
- execucao de piloto real;
- execucao de rollback real;
- coleta de evidencia operacional real;
- alteracao de registry real;
- alteracao de allowlist real;
- abertura de tenant DB real;
- mudanca de roteamento;
- uso de unidade real;
- uso de usuario real;
- uso de dado real;
- uso de trafego real;
- exposicao ao Portal;
- inclusao de PostgreSQL no escopo.

### 11.4 Criterios para recomendacao final da Fase M

Registrar que a Fase M, se todos os gates documentais forem satisfeitos, podera encerrar apenas com recomendacao documental, por exemplo:

- apto para discutir fase posterior explicita;
- apto para preparar, em fase posterior, um contrato de execucao manual controlada;
- apto para manter candidato sintetico como unico alvo admissivel;
- apto para manter rollback e evidencias como pre-condicoes obrigatorias.

Mas deixar claro que a recomendacao final da Fase M nao podera significar:

- executar;
- preparar operacao concreta;
- criar caller real;
- criar rota, CLI, script, job, bootstrap ou request path;
- alterar registry real;
- alterar allowlist real;
- abrir tenant DB real;
- mudar roteamento;
- envolver Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

Se mencionar fase posterior, deixar explicito que ela dependera de abertura explicita, contrato proprio, gates proprios, rollback proprio e autorizacao propria.

### 11.5 Resultado dos criterios

Registrar:

- criteriosDefined: true;
- rollbackPlanDefined permanece true;
- evidencePlanDefined permanece true;
- preparationContractReady permanece false;
- executionStillForbidden permanece true;
- blockedReasons permanece [].

Interpretacao obrigatoria:

- criteriosDefined=true significa apenas que os criterios documentais foram definidos.
- criteriosDefined=true nao autoriza execucao.
- criteriosDefined=true nao autoriza preparacao operacional concreta.
- criteriosDefined=true nao autoriza criar comando.
- criteriosDefined=true nao autoriza criar script.
- criteriosDefined=true nao autoriza criar caller real.
- criteriosDefined=true nao autoriza criar rota, CLI, job, bootstrap ou request path.
- criteriosDefined=true nao autoriza ler ou alterar registry real.
- criteriosDefined=true nao autoriza ler ou alterar allowlist real.
- criteriosDefined=true nao autoriza abrir tenant DB real.
- criteriosDefined=true nao autoriza mudar roteamento.
- criteriosDefined=true nao autoriza envolver Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

## 12. Checklist documental da Fase M

Registrar que o checklist da Fase M e documental, preparatorio e nao operacional.

### 12.1 Checklist aplicado

Registrar os itens abaixo como verificados documentalmente:

- candidato sintetico herdado preservado;
- targetId permanece `fase-j-synthetic-unit-candidate-001`;
- unidadeId permanece `0000000000000000000000a1`;
- dbName permanece `wdgestor_unit_0000000000000000000000a1`;
- databaseKey permanece `wdgestor_unit_0000000000000000000000a1`;
- plannedAllowlist permanece unitaria, explicita e sintetica;
- rollbackPlanDefined=true;
- evidencePlanDefined=true;
- criteriosDefined=true;
- executionStillForbidden=true;
- blockedReasons=[];
- fallback para `baseConnection` preservado como requisito obrigatorio;
- ausencia de caller real preservada;
- ausencia de rota, CLI, script, job, bootstrap ou request path preservada;
- ausencia de alteracao em registry real preservada;
- ausencia de alteracao em allowlist real preservada;
- ausencia de tenant DB real aberto preservada;
- ausencia de Portal preservada;
- ausencia de dados reais preservada;
- ausencia de trafego real preservada;
- ausencia de usuario real preservada;
- ausencia de unidade real preservada;
- ausencia de PostgreSQL preservada;
- baseline curta verde.

### 12.2 Resultado do checklist

Registrar:

- preparationContractReady: true;
- rollbackPlanDefined permanece true;
- evidencePlanDefined permanece true;
- criteriosDefined permanece true;
- executionStillForbidden permanece true;
- blockedReasons permanece [].

Interpretacao obrigatoria:

- preparationContractReady=true significa apenas que o contrato documental de preparacao da Fase M esta pronto.
- preparationContractReady=true nao autoriza execucao.
- preparationContractReady=true nao autoriza preparacao operacional concreta.
- preparationContractReady=true nao autoriza criar comando.
- preparationContractReady=true nao autoriza criar script.
- preparationContractReady=true nao autoriza criar caller real.
- preparationContractReady=true nao autoriza criar rota, CLI, job, bootstrap ou request path.
- preparationContractReady=true nao autoriza ler ou alterar registry real.
- preparationContractReady=true nao autoriza ler ou alterar allowlist real.
- preparationContractReady=true nao autoriza abrir tenant DB real.
- preparationContractReady=true nao autoriza mudar roteamento.
- preparationContractReady=true nao autoriza coletar evidencia operacional real.
- preparationContractReady=true nao autoriza envolver Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

### 12.3 Estado documental apos checklist

Registrar:

- A Fase M fica documentalmente apta a ser encerrada em microcorte posterior.
- Esse estado nao e encerramento global automatico.
- Esse estado nao abre proxima fase.
- Esse estado nao autoriza execucao.
- Esse estado nao autoriza preparacao operacional concreta.
- O proximo microcorte podera ser o encerramento documental da Fase M ou atualizacao de status, conforme decisao posterior.
- Antes de fechamento global/publicacao da Fase M, recomendar `npm test` completo.

### 12.4 Resultado decisorio provisorio

Registrar:

- Resultado provisorio: apto para encerrar documentalmente a Fase M com recomendacao de fase posterior explicita.
- Interpretacao obrigatoria: "apto para encerrar documentalmente" nao significa executar, preparar operacao ou criar caller real.
- Qualquer fase posterior que trate execucao manual controlada devera ser aberta explicitamente, com contrato proprio, gates proprios, rollback proprio e autorizacao propria.

## 13. Limite semantico da Fase M

Registrar:

- Preparar contrato nao e preparar operacao.
- Planejar rollback nao e executar rollback.
- Planejar evidencias nao e coletar evidencias reais.
- Descrever comando futuro nao e autorizar comando.
- Gate verde nao autoriza execucao.
- Fase posterior possivel nao significa fase posterior aberta.
- A Fase M so pode encerrar com recomendacao documental.

## 14. Resultado inicial

Registrar:

- Status: Aberta.
- Resultado inicial: contrato de preparacao ainda nao consolidado.
- preparationContractReady=false.
- blockedReasons=[].
- Execucao continua proibida.

## 15. Interpretacao obrigatoria

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
