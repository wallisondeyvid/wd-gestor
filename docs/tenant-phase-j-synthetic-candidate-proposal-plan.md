# Fase J - Proposta Documental de Candidato Sintetico Controlado Multi-DB

## 1. Titulo

- Fase J - Proposta Documental de Candidato Sintetico Controlado Multi-DB.

## 2. Estado herdado

- a Fase F esta publicada com owner manual minimo e contratos de ativacao e rollback;
- a Fase G esta publicada com entrypoint manual minimo e harness do piloto nao produtivo;
- a Fase H esta publicada com envelope operacional;
- a Fase I esta publicada com matriz de elegibilidade, aplicacao inicial da matriz e conclusao `eligible=false` por ausencia de candidato admissivel;
- a Fase J foi aberta em `fdafa94` com o microcorte documental de abertura da nova fase;
- ainda nao ha candidato formal completo;
- ainda nao ha selecao operacional de alvo;
- ainda nao ha execucao real.

Leitura operacional herdada:

- a Fase J herda a matriz da Fase I como contrato de aceite e recusa;
- a Fase J herda o envelope da Fase H como moldura operacional futura, ainda sem execucao;
- a Fase J herda o harness da Fase G apenas como caracterizacao tecnica, nunca como selecao automatica de alvo;
- a Fase J continua sem caller real, rota, CLI, script, job, bootstrap ou request path.

## 3. Objetivo da Fase J

- propor documentalmente um candidato sintetico controlado;
- preencher os campos exigidos pela matriz da Fase I;
- definir o pacote de evidencias esperado;
- definir a baseline esperada;
- definir `ownerContextPlan`;
- definir `rollbackPlan`;
- nao executar nada;
- nao selecionar operacionalmente alvo;
- nao criar superficie operacional.

## 4. Diferenca entre propor, selecionar e executar

Propor candidato:

- escrever uma proposta documental completa;
- preencher os campos da matriz;
- permitir revisao futura.

Selecionar alvo:

- so pode acontecer em microcorte ou fase posterior;
- exige aplicacao formal da matriz;
- exige `eligible=true` documentado;
- ainda nao autoriza execucao automatica.

Executar piloto:

- exige nova fase ou bloco explicito;
- exige autorizacao explicita;
- exige baseline final;
- exige garantias contra caller real e superficie operacional indevida.

## 5. Molde do candidato sintetico

- `targetId`: `fase-j-synthetic-unit-candidate-001`;
- `targetKind`: `syntheticUnit`;
- `environment`: `non-production`;
- `dataClass`: `discardable`;
- `trafficClass`: `none`;
- `userClass`: `none`;
- `portalExposure`: `none`;
- `dedicatedDatabase`: `true`;
- `unidadeId`: ainda a definir documentalmente;
- `dbName`: ainda a definir documentalmente;
- `databaseKey`: ainda a definir documentalmente;
- `plannedAllowlist`: deve ser unitaria, deve conter somente o `unidadeId` do candidato e ainda esta a definir documentalmente;
- `rollbackPlan`: ainda a definir documentalmente;
- `evidencePlan`: ainda a definir documentalmente;
- `baselinePlan`: ainda a definir documentalmente;
- `ownerContextPlan`: `source=manual`, `approved=true`, `actor` a definir e `reason` a definir.

## 6. Campos ainda pendentes

- `unidadeId`;
- `dbName`;
- `databaseKey`;
- `plannedAllowlist`;
- `rollbackPlan`;
- `evidencePlan`;
- `baselinePlan`;
- `actor`;
- `reason`.

## 7. Criterios para a proposta evoluir

- todos os campos pendentes precisam ser preenchidos documentalmente;
- nenhuma informacao pode ser inferida de harness ou teste;
- exemplos de teste nao podem virar alvo automaticamente;
- nenhum script existente pode ser usado como autorizacao;
- qualquer ambiguidade mantem `eligible=false`;
- ausencia de evidencia mantem `eligible=false`.

## 8. O que a Fase J nao autoriza

- nao autoriza execucao real;
- nao autoriza ativacao real;
- nao autoriza selecao operacional de alvo;
- nao autoriza caller real;
- nao autoriza rota;
- nao autoriza CLI;
- nao autoriza script;
- nao autoriza job;
- nao autoriza bootstrap;
- nao autoriza request path;
- nao autoriza Portal;
- nao autoriza dados reais;
- nao autoriza trafego real;
- nao autoriza unidade real;
- nao autoriza PostgreSQL;
- nao autoriza remover fallback.

## 9. Sequencia recomendada da Fase J

- Microcorte 1: abertura documental da Fase J;
- Microcorte 2: documento canonico da proposta de candidato;
- Microcorte 3: preencher campos pendentes do candidato, se possivel, ainda sem execucao;
- Microcorte 4: aplicar a matriz da Fase I ao candidato proposto;
- Microcorte 5: se `eligible=true`, documentar selecao futura como decisao separada; se `eligible=false`, encerrar ou pausar a Fase J sem execucao.

Leitura operacional da sequencia:

- nenhum microcorte da Fase J deve criar caller real, rota, CLI, script, job, bootstrap ou request path;
- nenhum microcorte da Fase J deve operar unidade real, dados reais, trafego real ou Portal;
- qualquer continuidade futura continua dependente de baseline final completa antes de publicacao global.

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
- push apenas no fechamento global da Fase J, apos baseline final completa e autorizacao explicita.
