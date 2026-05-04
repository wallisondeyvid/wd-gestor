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

- pacote de evidencias pre-execucao do candidato;
- criterios de sucesso especificos do candidato;
- criterios de abortar especificos do candidato;
- checklist de gates preservados;
- regra explicita de nao operacao;
- plano de leitura das evidencias sem executar operacao real;
- decisao final se o candidato esta pronto para uma fase posterior de validacao controlada.

## 8. Sequencia sugerida da Fase K

- Microcorte 1: abertura documental da Fase K e criacao do documento canonico;
- Microcorte 2: definir pacote de evidencias pre-execucao do candidato;
- Microcorte 3: definir criterios de sucesso e abortar especificos do candidato;
- Microcorte 4: definir checklist de gates preservados e regra de nao operacao;
- Microcorte 5: aplicar checklist da Fase K ao candidato;
- Microcorte 6: encerrar documentalmente a Fase K.

Leitura operacional da sequencia:

- nenhum microcorte da Fase K deve executar, ativar, criar caller ou criar superficie operacional;
- nenhum microcorte da Fase K deve transformar `eligible=true` ou selecao documental em autorizacao operacional;
- qualquer continuidade futura continua dependente de fase ou bloco explicito posterior.

## 9. Criterios que impedem avanco operacional

- `eligible=true` nao e autorizacao de execucao;
- selecao documental nao e operacao;
- ausencia de fase posterior explicita;
- ausencia de autorizacao explicita;
- ausencia de baseline completa;
- ausencia de rollback preservado;
- ausencia de gates preservados;
- qualquer ambiguidade sobre Portal, dado real, trafego real ou unidade real;
- qualquer tentativa de criar caller real, rota, CLI, script, job, bootstrap ou request path.

## 10. Baseline obrigatoria

- `npm run verify:imports`;
- `node --test .\tests\architecture\unitDatabaseRegistryManualOwner.contract.test.js`;
- `node --test .\tests\architecture\unitDatabaseRegistryManualEntrypoint.contract.test.js`;
- `node --test .\tests\architecture\unitDatabaseRegistryNonProductionPilot.contract.test.js`;
- `node --test .\tests\architecture\unitDatabaseRegistryControlledPilot.contract.test.js`;
- `node --test .\tests\architecture\unitDatabaseRegistryWriterResolveConnection.contract.test.js`;
- `npm test` antes de publicacao global.

## 11. Regra de publicacao

- commits locais podem acumular;
- sem push em microcortes;
- push apenas no fechamento global da Fase K, apos baseline final completa e autorizacao explicita.
