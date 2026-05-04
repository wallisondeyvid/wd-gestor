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

## 9. Sequencia sugerida da Fase K

- Microcorte 1: abertura documental da Fase K e criacao do documento canonico;
- Microcorte 2: definir pacote de evidencias pre-execucao do candidato, consolidado neste microcorte;
- Microcorte 3: definir criterios de sucesso e abortar especificos do candidato;
- Microcorte 4: definir checklist de gates preservados e regra de nao operacao;
- Microcorte 5: aplicar checklist da Fase K ao candidato;
- Microcorte 6: encerrar documentalmente a Fase K.

Leitura operacional da sequencia:

- nenhum microcorte da Fase K deve executar, ativar, criar caller ou criar superficie operacional;
- nenhum microcorte da Fase K deve transformar `eligible=true` ou selecao documental em autorizacao operacional;
- qualquer continuidade futura continua dependente de fase ou bloco explicito posterior.

## 10. Criterios que impedem avanco operacional

- `eligible=true` nao e autorizacao de execucao;
- selecao documental nao e operacao;
- ausencia de fase posterior explicita;
- ausencia de autorizacao explicita;
- ausencia de baseline completa;
- ausencia de rollback preservado;
- ausencia de gates preservados;
- qualquer ambiguidade sobre Portal, dado real, trafego real ou unidade real;
- qualquer tentativa de criar caller real, rota, CLI, script, job, bootstrap ou request path.

## 11. Baseline obrigatoria

- `npm run verify:imports`;
- `node --test .\tests\architecture\unitDatabaseRegistryManualOwner.contract.test.js`;
- `node --test .\tests\architecture\unitDatabaseRegistryManualEntrypoint.contract.test.js`;
- `node --test .\tests\architecture\unitDatabaseRegistryNonProductionPilot.contract.test.js`;
- `node --test .\tests\architecture\unitDatabaseRegistryControlledPilot.contract.test.js`;
- `node --test .\tests\architecture\unitDatabaseRegistryWriterResolveConnection.contract.test.js`;
- `npm test` antes de publicacao global.

## 12. Regra de publicacao

- commits locais podem acumular;
- sem push em microcortes;
- push apenas no fechamento global da Fase K, apos baseline final completa e autorizacao explicita.
