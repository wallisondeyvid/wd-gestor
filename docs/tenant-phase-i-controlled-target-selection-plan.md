# Fase I - Selecao de Alvo Controlado Nao Produtivo Multi-DB

## 1. Nome da fase

- Fase I - Selecao de Alvo Controlado Nao Produtivo Multi-DB.

## 2. Estado herdado

- a Fase F esta encerrada e publicada;
- a Fase G esta encerrada e publicada;
- a Fase H esta encerrada e publicada;
- o owner manual minimo existe em `src/shared/db/unitDatabaseRegistryManualOwner.js`;
- o entrypoint manual minimo existe em `src/shared/db/unitDatabaseRegistryManualEntrypoint.js`;
- o harness do piloto nao produtivo existe em `tests/architecture/unitDatabaseRegistryNonProductionPilot.contract.test.js`;
- o envelope operacional existe em `docs/tenant-phase-h-operational-envelope-contract.md`;
- `resolveConnection` segue como unico decisor de tenant routing;
- ainda nao houve piloto real;
- ainda nao houve ativacao real;
- ainda nao ha caller real.

Leitura operacional herdada:

- o corredor `registry -> writer -> owner -> entrypoint` continua cercado por contrato, implementacao minima e harness arquitetural;
- o owner permanece sem caller real;
- o entrypoint permanece sem caller real;
- nao ha rota, CLI, script, job, bootstrap ou request path ligados a esse corredor;
- o envelope operacional da Fase H permanece como moldura preparatoria, e nao como autorizacao de execucao;
- a abertura da Fase I nasce apos o encerramento publicado da Fase H em `a8ad769`, e nao reabre implicitamente nenhuma superficie operacional.

## 3. Objetivo da Fase I

- selecionar e congelar documentalmente um alvo admissivel para futura validacao controlada nao produtiva;
- definir matriz de elegibilidade do alvo;
- definir criterios de exclusao;
- definir pacote minimo de evidencias;
- definir criterios de abortar;
- nao executar piloto real nesta fase de abertura;
- nao criar superficie operacional.

## 4. Definicao de alvo admissivel

- ambiente nao produtivo;
- unidade sintetica ou espelho controlado;
- dados descartaveis;
- DB dedicado;
- `databaseKey`, `dbName` e `unidadeId` coerentes;
- allowlist unitaria planejada;
- sem usuario real;
- sem trafego real;
- sem Portal;
- rollback definido antes de qualquer execucao;
- contexto manual explicito com:
- `source=manual`;
- `approved=true`;
- `actor` nao vazio;
- `reason` nao vazio.

Leitura operacional:

- alvo admissivel nao implica execucao autorizada nesta fase;
- congelar o alvo documentalmente nao autoriza caller real, rota, CLI, script, job, bootstrap ou request path;
- qualquer ausencia, incoerencia ou ambiguidade continua degradando para nao selecionar o alvo.

## 5. Criterios de exclusao imediata

- producao;
- unidade real;
- dados reais;
- usuario real;
- trafego real;
- Portal;
- rota admin;
- rota interna;
- CLI;
- script;
- job;
- bootstrap;
- preload automatico;
- request path;
- PostgreSQL;
- remocao de fallback;
- alteracao de `resolveConnection`;
- alteracao de writer, registry, reader ou preload;
- alteracao do owner;
- alteracao do entrypoint;
- allowlist multipla;
- ausencia de rollback;
- ausencia de evidencia.

## 6. Matriz minima de elegibilidade

- `unidadeId` definido;
- `dbName` definido;
- `databaseKey` definido;
- `environment` nao produtivo;
- `syntheticUnit=true` ou `controlledMirror=true`;
- `dataClass=discardable`;
- `trafficClass=none`;
- `userClass=none`;
- `plannedAllowlist` com uma unica unidade;
- `rollbackPlan` definido;
- `successCriteria` definido;
- `abortCriteria` definido;
- `evidencePlan` definido;
- `baselinePlan` definido.

## 7. Pacote minimo de evidencias para aceitar um alvo

- identificacao do alvo;
- justificativa de nao producao;
- justificativa de dados descartaveis;
- confirmacao de ausencia de usuario real;
- confirmacao de ausencia de trafego real;
- confirmacao de ausencia de Portal;
- confirmacao de DB dedicado;
- confirmacao de allowlist unitaria planejada;
- confirmacao de rollback planejado;
- confirmacao de baseline curta;
- confirmacao de que nao ha caller real;
- confirmacao de que nao ha rota, CLI, script, job, bootstrap ou request path.

## 8. O que a Fase I nao autoriza

- nao autoriza executar piloto;
- nao autoriza ativar unidade;
- nao autoriza criar caller real;
- nao autoriza criar CLI;
- nao autoriza criar script;
- nao autoriza criar rota;
- nao autoriza criar job;
- nao autoriza criar bootstrap;
- nao autoriza plugar em request path;
- nao autoriza operar dados reais.

## 9. Sequencia recomendada da Fase I

- Microcorte 1: abertura documental da Fase I;
- Microcorte 2: contrato documental da matriz de elegibilidade do alvo;
- Microcorte 3: decisao read-only sobre se existe alvo admissivel no estado atual;
- Microcorte 4: se houver alvo, documentar selecao do alvo sem executar;
- Microcorte 5: se nao houver alvo, encerrar ou pausar a fase sem execucao.

Leitura operacional da sequencia:

- nenhum passo deve criar rota, CLI, script, job, bootstrap ou request path sem nova decisao explicita;
- nenhum passo deve abrir caller real como atalho de execucao;
- nenhum passo deve operar unidade real, dados reais, usuarios reais ou trafego real;
- qualquer publicacao futura continua dependente de baseline final completa antes de fechamento global.

Checkpoint atual desta sequencia:

- o Microcorte 2 fica registrado no documento [tenant-phase-i-target-eligibility-matrix-contract.md](tenant-phase-i-target-eligibility-matrix-contract.md);
- esse contrato define criterios objetivos de aceite e recusa para alvo candidato sem selecionar alvo concreto e sem autorizar execucao real.

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
- push apenas no fechamento global da Fase I, apos baseline final completa e autorizacao explicita.