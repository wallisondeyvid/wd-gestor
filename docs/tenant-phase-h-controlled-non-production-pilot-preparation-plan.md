# Fase H - Preparacao de Piloto Controlado Nao Produtivo Multi-DB por Unidade

## 1. Nome da fase

- Fase H - Preparacao de Piloto Controlado Nao Produtivo Multi-DB por Unidade.

## 2. Estado herdado

- a Fase F esta encerrada e publicada;
- a Fase G esta encerrada e publicada;
- o owner manual minimo existe em `src/shared/db/unitDatabaseRegistryManualOwner.js`;
- o entrypoint manual minimo existe em `src/shared/db/unitDatabaseRegistryManualEntrypoint.js`;
- o harness do piloto nao produtivo existe em `tests/architecture/unitDatabaseRegistryNonProductionPilot.contract.test.js`;
- `resolveConnection` continua sendo o unico decisor de tenant routing;
- ainda nao houve piloto real;
- ainda nao houve ativacao real;
- ainda nao ha caller real.

Leitura operacional herdada:

- o corredor `registry -> writer -> owner -> entrypoint` ja esta cercado por contrato, implementacao minima e harness arquitetural;
- o owner permanece sem caller real;
- o entrypoint permanece sem caller real;
- nao ha rota, CLI, script, job, bootstrap ou request path ligados a esse corredor;
- a allowlist e os demais gates continuam sendo apenas gates, nunca atalhos de liberacao;
- fallback e rollback para `baseConnection` permanecem como regra de seguranca.

## 3. Objetivo da Fase H

- preparar o envelope operacional do futuro piloto controlado nao produtivo;
- definir ritual, alvo admissivel, evidencias, criterios de sucesso, criterios de abortar, baseline e fronteiras;
- nao executar piloto real nesta abertura;
- nao criar superficie operacional nesta abertura.

## 4. Fora de escopo

- producao;
- unidade real;
- dados reais;
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
- alteracao do entrypoint.

## 5. Alvo admissivel futuro

- ambiente nao produtivo;
- unidade sintetica ou espelho controlado;
- dados descartaveis;
- DB dedicado;
- allowlist unitaria;
- sem usuario real;
- sem trafego real;
- sem Portal;
- rollback definido antes de qualquer execucao.

Leitura operacional:

- alvo admissivel nao implica execucao autorizada nesta abertura;
- a admissibilidade do alvo continua subordinada a nova decisao explicita posterior;
- qualquer duvida operacional continua degradando para nao executar.

## 6. O que ainda bloqueia execucao real

- falta ritual operacional publicado da Fase H;
- falta pacote de evidencias obrigatorio;
- falta matriz de abortar;
- falta baseline final especifica da fase;
- falta decisao explicita posterior autorizando qualquer execucao;
- falta prova de que a execucao nao exigira caller real nem superficie operacional.

## 7. Sequencia recomendada da Fase H

- Microcorte 1: abertura documental da Fase H;
- Microcorte 2: contrato documental do envelope operacional do piloto;
- Microcorte 3: teste ou harness de preparacao, se necessario, sem executar piloto real;
- Microcorte 4: decisao read-only sobre se ha base para execucao nao produtiva controlada;
- Microcorte 5: encerramento ou continuacao explicita, dependendo da decisao.

Leitura operacional da sequencia:

- nenhum passo deve criar rota, CLI, script, job, bootstrap ou request path sem nova decisao explicita;
- nenhum passo deve abrir caller real como atalho de execucao;
- nenhum passo deve operar unidade real, dados reais ou trafego real;
- qualquer sequencia futura continua dependente de baseline final completa antes de publicacao global.

Checkpoint atual desta sequencia:

- o Microcorte 2 fica registrado no documento [tenant-phase-h-operational-envelope-contract.md](tenant-phase-h-operational-envelope-contract.md);
- esse contrato fecha apenas a moldura documental do envelope operacional e nao autoriza execucao real nem criacao de superficie operacional.

## 8. Baseline obrigatoria da fase

- `npm run verify:imports`;
- `node --test .\tests\architecture\unitDatabaseRegistryManualOwner.contract.test.js`;
- `node --test .\tests\architecture\unitDatabaseRegistryManualEntrypoint.contract.test.js`;
- `node --test .\tests\architecture\unitDatabaseRegistryNonProductionPilot.contract.test.js`;
- `node --test .\tests\architecture\unitDatabaseRegistryControlledPilot.contract.test.js`;
- `node --test .\tests\architecture\unitDatabaseRegistryWriterResolveConnection.contract.test.js`;
- `npm test` antes de qualquer publicacao global.

## 9. Regra de publicacao

- commits locais podem acumular;
- sem push em microcortes;
- push apenas no fechamento global da Fase H, apos baseline final completa e autorizacao explicita.