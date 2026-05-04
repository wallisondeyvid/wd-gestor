# Fase K - Plano de Validacao Controlada Nao Operacional do Candidato Sintetico Multi-DB

## 1. Titulo

- Fase K - Plano de Validacao Controlada Nao Operacional do Candidato Sintetico Multi-DB.

## 2. Estado herdado

- a Fase F esta publicada com owner manual minimo e contratos de ativacao e rollback;
- a Fase G esta publicada com entrypoint manual minimo e harness nao produtivo;
- a Fase H esta publicada com envelope operacional generico;
- a Fase I esta publicada com matriz de elegibilidade;
- a Fase J esta publicada com candidato sintetico elegivel e selecionado documentalmente;
- a base atual desta abertura e `a58848c docs(tenant): encerra fase j`.

Leitura operacional herdada:

- o corredor multi-tenant continua sem execucao real;
- o candidato da Fase J ja existe como alvo documentalmente elegivel e selecionado;
- a lacuna real deixa de ser elegibilidade e passa a ser amarracao candidato-especifica do envelope da Fase H;
- a continuidade continua sem caller real, rota, CLI, script, job, bootstrap ou request path.

## 3. Objetivo da Fase K

- criar plano candidato-especifico de validacao controlada nao operacional;
- usar o candidato selecionado documentalmente na Fase J;
- amarrar matriz da Fase I, envelope da Fase H e selecao documental da Fase J;
- definir quais evidencias deverao existir antes de qualquer fase posterior de execucao;
- definir criterios de sucesso e abortar especificos do candidato;
- definir checklist de gates preservados;
- manter zero execucao.

## 4. Candidato alvo da Fase K

- `targetId`: `fase-j-synthetic-unit-candidate-001`;
- `unidadeId`: `0000000000000000000000a1`;
- `dbName`: `wdgestor_unit_0000000000000000000000a1`;
- `databaseKey`: `wdgestor_unit_0000000000000000000000a1`;
- `plannedAllowlist`: `[0000000000000000000000a1]`;
- `targetKind`: `syntheticUnit`;
- `environment`: `non-production`;
- `dataClass`: `discardable`;
- `trafficClass`: `none`;
- `userClass`: `none`;
- `portalExposure`: `none`;
- `dedicatedDatabase`: `true`.

## 5. Natureza da Fase K

- documental;
- candidato-especifica;
- nao operacional;
- nao executavel por si so;
- nao cria autorizacao de execucao;
- nao cria autorizacao de ativacao;
- nao cria autorizacao de caller real.

## 6. Fora de escopo

- execucao real;
- ativacao real;
- writer real;
- owner real;
- entrypoint real;
- `resolveConnection` operacional;
- registry real;
- allowlist real;
- tenant DB real;
- mudanca de roteamento;
- caller real;
- rota;
- CLI;
- script;
- job;
- bootstrap;
- request path;
- Portal;
- dados reais;
- trafego real;
- usuario real;
- unidade real;
- PostgreSQL;
- remocao de fallback.

## 7. Lacunas que a Fase K deve fechar

- aplicacao documental futura do pacote de evidencias pre-execucao do candidato;
- criterios de sucesso especificos do candidato;
- criterios de abortar especificos do candidato;
- checklist de gates preservados;
- regra explicita de nao operacao;
- plano de leitura das evidencias sem executar operacao real;
- decisao final se o candidato esta pronto para uma fase posterior de validacao controlada.

## 8. Pacote de evidencias pre-execucao do candidato

Escopo deste pacote:

- o pacote de evidencias pre-execucao desta fase fica amarrado exclusivamente ao candidato `fase-j-synthetic-unit-candidate-001`;
- o objetivo deste pacote e definir o que devera ser confirmado antes de qualquer fase posterior de validacao;
- este microcorte nao coleta evidencia real;
- este microcorte nao executa entrypoint;
- este microcorte nao aciona owner;
- este microcorte nao chama writer;
- este microcorte nao chama `resolveConnection`;
- este microcorte nao altera registry ou allowlist real;
- este microcorte nao abre tenant DB.

### 8.1 Principio

- evidencia pre-execucao e lista obrigatoria do que devera ser confirmado antes de qualquer fase posterior de validacao controlada;
- a lista abaixo define obrigatorios documentais e nao substitui evidencia real futura;
- este microcorte apenas registra o pacote esperado;
- nenhum item desta secao autoriza execucao, ativacao ou superficie operacional.

### 8.2 Evidencias documentais obrigatorias

Identidade do candidato:

- `targetId=fase-j-synthetic-unit-candidate-001`;
- `unidadeId=0000000000000000000000a1`;
- `dbName=wdgestor_unit_0000000000000000000000a1`;
- `databaseKey=wdgestor_unit_0000000000000000000000a1`;
- `plannedAllowlist=[0000000000000000000000a1]`.

Natureza sintetica:

- `targetKind=syntheticUnit`;
- `environment=non-production`;
- `dataClass=discardable`;
- `trafficClass=none`;
- `userClass=none`;
- `portalExposure=none`;
- `dedicatedDatabase=true`.

Coerencia do alvo:

- `unidadeId` nao vazio;
- `dbName` e `databaseKey` coerentes com `unidadeId`;
- `plannedAllowlist` unitaria;
- `plannedAllowlist` contendo somente o `unidadeId` do candidato.

Ausencia de risco operacional:

- sem unidade real;
- sem dados reais;
- sem trafego real;
- sem Portal;
- sem usuario real;
- sem rota;
- sem CLI;
- sem script;
- sem job;
- sem bootstrap;
- sem request path.

Gates e fallback:

- `readiness` devera permanecer obrigatorio;
- `activation` devera permanecer obrigatorio;
- allowlist devera permanecer unitaria;
- fallback para `baseConnection` devera permanecer preservado quando gates forem removidos;
- rollback devera permanecer definido antes de qualquer fase posterior.

Contexto manual:

- `source=manual`;
- `approved=true`;
- `actor` nao vazio;
- `reason` nao vazio.

Baseline:

- `npm run verify:imports` verde;
- contratos `owner`, `entrypoint`, `nonProductionPilot`, `controlledPilot` e `writerResolveConnection` verdes;
- `npm test` verde antes de qualquer publicacao global ou avanco posterior.

### 8.3 Resultado esperado do pacote

- `evidenceReady=true` somente se todas as evidencias obrigatorias estiverem documentadas e sem ambiguidade;
- `evidenceReady=false` se qualquer evidencia estiver ausente, ambigua ou contraditoria;
- `warnings` nao substituem obrigatorios;
- ausencia de evidencia bloqueia qualquer fase posterior de execucao.

### 8.4 Tabela sugerida do pacote

| Evidencia | Valor esperado | Fonte documental | Resultado esperado | Observacao |
| --- | --- | --- | --- | --- |
| Identidade do candidato | `targetId`, `unidadeId`, `dbName`, `databaseKey` e `plannedAllowlist` coerentes com o candidato selecionado | Fase J; Fase K | obrigatoria | sem candidato coerente, `evidenceReady=false` |
| Natureza sintetica | `targetKind=syntheticUnit`, `environment=non-production`, `dataClass=discardable`, `trafficClass=none`, `userClass=none`, `portalExposure=none`, `dedicatedDatabase=true` | Fase J; matriz da Fase I | obrigatoria | qualquer desvio bloqueia fase posterior |
| Coerencia do alvo | `unidadeId` nao vazio, `dbName/databaseKey` coerentes e allowlist unitaria contendo somente a unidade do candidato | Fase J; matriz da Fase I | obrigatoria | ambiguidade ou allowlist multipla invalida o pacote |
| Ausencia de risco operacional | sem unidade real, dados reais, trafego real, Portal, usuario real e sem superficie operacional | Fase H; Fase I; Fase K | obrigatoria | qualquer risco operacional mantem bloqueio |
| Gates e fallback | `readiness` e `activation` obrigatorios, allowlist unitaria, fallback para `baseConnection` preservado e rollback definido | envelope da Fase H; Fase K | obrigatoria | perda de gate ou fallback invalida readiness documental |
| Contexto manual | `source=manual`, `approved=true`, `actor` nao vazio e `reason` nao vazio | Fase J; matriz da Fase I | obrigatoria | contexto incompleto impede qualquer avanco |
| Baseline | `verify:imports` e contratos verdes; `npm test` verde antes de publicacao global | Fase H; Fase I; Fase K | obrigatoria | `warnings` nao substituem baseline |

### 8.5 Relacao com a Fase J

- a Fase J selecionou documentalmente o candidato `fase-j-synthetic-unit-candidate-001`;
- a Fase K nao reabre a selecao;
- a Fase K prepara evidencias pre-execucao do candidato ja selecionado;
- a Fase K nao executa o candidato.

### 8.6 Proximo microcorte

- definir criterios de sucesso especificos do candidato;
- definir criterios de abortar especificos do candidato;
- ainda sem execucao.

## 9. Criterios de sucesso e abortar do candidato

Escopo desta secao:

- os criterios desta secao ficam amarrados exclusivamente ao candidato `fase-j-synthetic-unit-candidate-001`;
- os criterios de sucesso e abortar desta fase sao documentais;
- eles servem para avaliar fase posterior de validacao controlada;
- eles nao executam nada nesta Fase K;
- eles nao autorizam ativacao, writer, owner, entrypoint, `resolveConnection`, registry real, allowlist real ou tenant DB real.

### 9.1 Principio

- criterio de sucesso e criterio de abortar desta fase definem somente a regra documental de avaliacao futura do candidato;
- nenhum criterio abaixo autoriza execucao real, piloto real, ativacao real ou mudanca de roteamento;
- warnings nao substituem criterios obrigatorios;
- ambiguidade deve degradar para abortar.

### 9.2 Criterios de sucesso especificos do candidato

- candidato permanece sintetico;
- `environment` permanece `non-production`;
- `dataClass` permanece `discardable`;
- `trafficClass` permanece `none`;
- `userClass` permanece `none`;
- `portalExposure` permanece `none`;
- `dedicatedDatabase` permanece `true`;
- `unidadeId` permanece `0000000000000000000000a1`;
- `dbName` permanece `wdgestor_unit_0000000000000000000000a1`;
- `databaseKey` permanece `wdgestor_unit_0000000000000000000000a1`;
- `plannedAllowlist` permanece unitaria e contem somente `0000000000000000000000a1`;
- `evidenceReady=true` em avaliacao documental futura;
- `ownerContextPlan` permanece com `source=manual`, `approved=true`, `actor` nao vazio e `reason` nao vazio;
- fallback para `baseConnection` permanece preservado quando qualquer gate for removido;
- `rollbackPlan` permanece definido antes de qualquer fase posterior;
- baseline curta permanece verde;
- baseline completa e exigida antes de publicacao global ou avanco posterior;
- nenhum caller real e criado;
- nenhuma rota, CLI, script, job, bootstrap ou request path e criado;
- nenhuma unidade real, dado real, trafego real, usuario real ou Portal e envolvido.

### 9.3 Criterios de abortar especificos do candidato

- qualquer duvida sobre unidade real;
- qualquer duvida sobre dado real;
- qualquer duvida sobre trafego real;
- qualquer duvida sobre usuario real;
- qualquer exposicao a Portal;
- `plannedAllowlist` ausente, vazia, multipla ou diferente do `unidadeId`;
- `unidadeId`, `dbName` ou `databaseKey` ausentes ou incoerentes;
- `environment` produtivo ou ambiguo;
- `targetKind` diferente de `syntheticUnit`;
- `dataClass` diferente de `discardable`;
- `trafficClass` diferente de `none`;
- `userClass` diferente de `none`;
- `portalExposure` diferente de `none`;
- `dedicatedDatabase` diferente de `true`;
- `ownerContextPlan` sem `source=manual`;
- `ownerContextPlan` sem `approved=true`;
- `actor` vazio;
- `reason` vazio;
- `rollbackPlan` ausente;
- `evidenceReady=false`;
- baseline curta falha;
- baseline completa falha antes de publicacao ou avanco;
- tentativa de criar caller real;
- tentativa de criar rota, CLI, script, job, bootstrap ou request path;
- tentativa de acionar writer, owner, entrypoint ou `resolveConnection`;
- tentativa de alterar registry real;
- tentativa de alterar allowlist real;
- tentativa de abrir tenant DB real;
- tentativa de mudar roteamento;
- tentativa de remover fallback;
- tentativa de envolver PostgreSQL.

### 9.4 Resultado esperado

- `validationPlanReady=true` somente se todos os criterios de sucesso estiverem satisfeitos documentalmente e nenhum criterio de abortar estiver presente;
- `validationPlanReady=false` se qualquer criterio de abortar estiver presente;
- warnings nao substituem criterios obrigatorios;
- ambiguidade deve degradar para abortar.

### 9.5 Tabela sugerida

| Tipo | Criterio | Resultado esperado | Acao se falhar |
| --- | --- | --- | --- |
| sucesso | Identidade e natureza do candidato permanecem exatamente como definidas na Fase J e consolidadas na Fase K | candidato continua apto para validacao documental futura | abortar avaliacao e manter `validationPlanReady=false` |
| sucesso | `plannedAllowlist` permanece unitaria e contendo somente `0000000000000000000000a1` | coerencia do alvo preservada | abortar avaliacao e bloquear avanco posterior |
| sucesso | `evidenceReady=true`, `rollbackPlan` definido e `ownerContextPlan` completo | plano documental continua consistente | abortar avaliacao e exigir saneamento documental |
| sucesso | fallback para `baseConnection` permanece preservado e baseline curta permanece verde | gates e seguranca continuam coerentes | abortar avaliacao e bloquear qualquer fase posterior |
| sucesso | nenhuma superficie operacional, unidade real, dado real, trafego real, usuario real ou Portal e envolvido | fase continua nao operacional | abortar avaliacao imediatamente |
| abortar | qualquer ambiguidade sobre unidade real, dado real, trafego real, usuario real ou Portal | `validationPlanReady=false` | interromper continuidade e manter plano nao operacional |
| abortar | qualquer incoerencia em `unidadeId`, `dbName`, `databaseKey` ou `plannedAllowlist` | `validationPlanReady=false` | interromper continuidade e corrigir documentacao |
| abortar | qualquer falha em `environment`, `targetKind`, `dataClass`, `trafficClass`, `userClass`, `portalExposure` ou `dedicatedDatabase` | `validationPlanReady=false` | interromper continuidade e reavaliar o candidato |
| abortar | qualquer falha em `ownerContextPlan`, `rollbackPlan`, `evidenceReady` ou baseline | `validationPlanReady=false` | interromper continuidade e bloquear avanco |
| abortar | qualquer tentativa de criar caller real, rota, CLI, script, job, bootstrap, request path, alterar registry ou allowlist real, abrir tenant DB real, mudar roteamento ou envolver PostgreSQL | `validationPlanReady=false` | abortar imediatamente e manter zero operacao |

### 9.6 Proximo microcorte

- definir checklist de gates preservados;
- definir regra explicita de nao operacao;
- ainda sem execucao.

## 10. Checklist de gates preservados e regra de nao operacao

Escopo desta secao:

- esta secao fica amarrada exclusivamente ao candidato `fase-j-synthetic-unit-candidate-001`;
- a Fase K nao abre operacao;
- a Fase K apenas define os gates que devem continuar obrigatorios em qualquer fase posterior;
- nenhum gate pode ser suavizado por documentacao;
- ausencia, ambiguidade ou quebra de qualquer gate bloqueia avanco;
- a regra padrao continua sendo fail-closed para `baseConnection`.

### 10.1 Principio

- os gates abaixo permanecem obrigatorios e documentados como pre-condicoes minimas de qualquer continuidade futura;
- a documentacao da Fase K nao substitui gate tecnico, nao remove fallback e nao autoriza excecao operacional;
- qualquer ausencia, ambiguidade, contradicao ou suavizacao documental deve degradar para bloqueio;
- o comportamento esperado em perda de gate continua sendo retorno para `baseConnection`.

### 10.2 Checklist de gates preservados

- `WD_MULTI_DB` deve continuar exigido para qualquer roteamento futuro;
- `WD_MULTI_DB_REGISTRY_READ` deve continuar exigido para qualquer leitura futura do registry;
- entry consistente deve continuar exigido;
- `readiness.ready=true` deve continuar exigido;
- `activation.active=true` deve continuar exigido;
- allowlist positiva deve continuar exigida;
- `plannedAllowlist` deve permanecer unitaria;
- `plannedAllowlist` deve conter somente `0000000000000000000000a1`;
- status bloqueante deve impedir roteamento tenant;
- `routingMode` bloqueante deve impedir roteamento tenant;
- ausencia de entry deve cair para `baseConnection`;
- erro de leitura do registry deve cair para `baseConnection`;
- incoerencia de `unidadeId`, `dbName` ou `databaseKey` deve cair para `baseConnection`;
- remocao de qualquer gate deve cair para `baseConnection`;
- fallback para `baseConnection` deve permanecer preservado;
- `rollbackPlan` deve permanecer definido antes de qualquer fase posterior;
- `ownerContextPlan` deve permanecer manual com `source=manual`, `approved=true`, `actor` nao vazio e `reason` nao vazio.

### 10.3 Regra explicita de nao operacao

- esta Fase K nao chama writer;
- esta Fase K nao chama owner;
- esta Fase K nao chama entrypoint;
- esta Fase K nao chama `resolveConnection`;
- esta Fase K nao le registry real;
- esta Fase K nao escreve registry real;
- esta Fase K nao altera allowlist real;
- esta Fase K nao abre tenant DB;
- esta Fase K nao cria DB;
- esta Fase K nao cria conexao tenant;
- esta Fase K nao muda roteamento;
- esta Fase K nao cria caller real;
- esta Fase K nao cria rota;
- esta Fase K nao cria CLI;
- esta Fase K nao cria script;
- esta Fase K nao cria job;
- esta Fase K nao cria bootstrap;
- esta Fase K nao pluga nada em request path;
- esta Fase K nao envolve Portal;
- esta Fase K nao envolve dado real;
- esta Fase K nao envolve trafego real;
- esta Fase K nao envolve usuario real;
- esta Fase K nao envolve unidade real;
- esta Fase K nao envolve PostgreSQL;
- esta Fase K nao remove fallback.

### 10.4 Resultado esperado

- `gatesPreserved=true` somente se todos os gates estiverem definidos como obrigatorios e nenhum for suavizado;
- `nonOperational=true` somente se a fase continuar sem chamadas operacionais, sem superficie nova e sem execucao real;
- `gatesPreserved=false` se qualquer gate for ausente, ambiguo ou suavizado;
- `nonOperational=false` se qualquer acao operacional surgir;
- se `gatesPreserved=false` ou `nonOperational=false`, o avanco deve ser bloqueado.

### 10.5 Tabela sugerida

| Categoria | Gate/regra | Resultado esperado | Acao se falhar |
| --- | --- | --- | --- |
| gate | `WD_MULTI_DB` e `WD_MULTI_DB_REGISTRY_READ` permanecem obrigatorios | gates globais preservados | bloquear avanco e manter fail-closed |
| gate | entry consistente, `readiness.ready=true`, `activation.active=true` e allowlist positiva permanecem obrigatorios | roteamento futuro continua dependente de gates completos | bloquear avanco e degradar para `baseConnection` |
| gate | `plannedAllowlist` permanece unitaria contendo somente `0000000000000000000000a1` | alvo documental continua coerente | bloquear avanco e corrigir documentacao |
| gate | status bloqueante, `routingMode` bloqueante, ausencia de entry, erro de leitura e incoerencia de identidade continuam caindo para `baseConnection` | fallback preservado | bloquear avanco e manter fail-closed |
| gate | `rollbackPlan` definido e `ownerContextPlan` manual completo permanecem obrigatorios | seguranca minima preservada | bloquear avanco e exigir saneamento documental |
| nao operacao | nenhuma chamada a writer, owner, entrypoint ou `resolveConnection` surge nesta fase | `nonOperational=true` | bloquear avanco e interromper continuidade |
| nao operacao | nenhuma leitura ou escrita de registry real, alteracao de allowlist real, abertura de tenant DB ou mudanca de roteamento surge nesta fase | `nonOperational=true` | bloquear avanco e manter zero operacao |
| nao operacao | nenhuma criacao de caller real, rota, CLI, script, job, bootstrap ou request path surge nesta fase | `nonOperational=true` | bloquear avanco e manter fase documental |
| nao operacao | nenhum Portal, dado real, trafego real, usuario real, unidade real ou PostgreSQL e envolvido | `nonOperational=true` | bloquear avanco imediatamente |

### 10.6 Proximo microcorte

- aplicar checklist da Fase K ao candidato;
- ainda sem execucao.

## 11. Sequencia sugerida da Fase K

- Microcorte 1: abertura documental da Fase K e criacao do documento canonico;
- Microcorte 2: definir pacote de evidencias pre-execucao do candidato, consolidado neste microcorte;
- Microcorte 3: definir criterios de sucesso e abortar especificos do candidato, consolidado neste microcorte;
- Microcorte 4: definir checklist de gates preservados e regra de nao operacao, consolidado neste microcorte;
- Microcorte 5: aplicar checklist da Fase K ao candidato;
- Microcorte 6: encerrar documentalmente a Fase K.

Leitura operacional da sequencia:

- nenhum microcorte da Fase K deve executar, ativar, criar caller ou criar superficie operacional;
- nenhum microcorte da Fase K deve transformar `eligible=true` ou selecao documental em autorizacao operacional;
- qualquer continuidade futura continua dependente de fase ou bloco explicito posterior.

## 12. Criterios que impedem avanco operacional

- `eligible=true` nao e autorizacao de execucao;
- selecao documental nao e operacao;
- ausencia de fase posterior explicita;
- ausencia de autorizacao explicita;
- ausencia de baseline completa;
- ausencia de rollback preservado;
- ausencia de gates preservados;
- qualquer ambiguidade sobre Portal, dado real, trafego real ou unidade real;
- qualquer tentativa de criar caller real, rota, CLI, script, job, bootstrap ou request path.

## 13. Baseline obrigatoria

- `npm run verify:imports`;
- `node --test .\tests\architecture\unitDatabaseRegistryManualOwner.contract.test.js`;
- `node --test .\tests\architecture\unitDatabaseRegistryManualEntrypoint.contract.test.js`;
- `node --test .\tests\architecture\unitDatabaseRegistryNonProductionPilot.contract.test.js`;
- `node --test .\tests\architecture\unitDatabaseRegistryControlledPilot.contract.test.js`;
- `node --test .\tests\architecture\unitDatabaseRegistryWriterResolveConnection.contract.test.js`;
- `npm test` antes de publicacao global.

## 14. Regra de publicacao

- commits locais podem acumular;
- sem push em microcortes;
- push apenas no fechamento global da Fase K, apos baseline final completa e autorizacao explicita.
