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
- `unidadeId`: `0000000000000000000000a1`;
- `dbName`: `wdgestor_unit_0000000000000000000000a1`;
- `databaseKey`: `wdgestor_unit_0000000000000000000000a1`;
- `plannedAllowlist`: `[0000000000000000000000a1]`, unitaria, contendo somente o `unidadeId` sintetico proposto e mantida apenas como plano documental;
- `rollbackPlan`: remover a unidade sintetica da allowlist planejada, desativar eventual estado documental futuro do candidato e garantir retorno esperado para `baseConnection` em qualquer avaliacao futura, sem executar rollback neste microcorte e sem chamar writer, owner, entrypoint ou `resolveConnection`;
- `evidencePlan`: registrar relatorio esperado do entrypoint manual em fase futura, confirmar `targetKind=syntheticUnit`, `environment=non-production`, `dataClass=discardable`, `trafficClass=none`, `userClass=none`, `portalExposure=none`, `dedicatedDatabase=true`, ausencia de dados reais, ausencia de trafego real, ausencia de Portal, allowlist unitaria planejada, fallback esperado para `baseConnection` quando gates forem removidos e rollback planejado, sem produzir evidencias reais neste microcorte;
- `baselinePlan`: `npm run verify:imports`; `node --test .\tests\architecture\unitDatabaseRegistryManualOwner.contract.test.js`; `node --test .\tests\architecture\unitDatabaseRegistryManualEntrypoint.contract.test.js`; `node --test .\tests\architecture\unitDatabaseRegistryNonProductionPilot.contract.test.js`; `node --test .\tests\architecture\unitDatabaseRegistryControlledPilot.contract.test.js`; `node --test .\tests\architecture\unitDatabaseRegistryWriterResolveConnection.contract.test.js`; e `npm test` antes de publicacao global ou qualquer avanco operacional futuro;
- `ownerContextPlan`: `source=manual`, `approved=true`, `actor=operador-fase-j-documental` e `reason=synthetic-candidate-proposal-draft`, registrados como valores documentais planejados e nao como execucao.

## 6. Estado do preenchimento documental

- a proposta da Fase J fica documentalmente mais completa neste microcorte;
- os campos `unidadeId`, `dbName`, `databaseKey`, `plannedAllowlist`, `rollbackPlan`, `evidencePlan`, `baselinePlan`, `actor` e `reason` deixam de ficar pendentes;
- os valores preenchidos neste microcorte sao sinteticos, novos e exclusivos da Fase J;
- os exemplos de testes e harness com `000000000000000000000050`, `000000000000000000000020`, `000000000000000000000021` e `000000000000000000000022` continuam proibidos como fonte automatica de alvo;
- este preenchimento documental nao significa `eligible=true`;
- este preenchimento documental nao significa selecao operacional;
- este preenchimento documental nao significa execucao;
- este preenchimento documental nao significa ativacao;
- este preenchimento documental nao autoriza caller real, rota, CLI, script, job, bootstrap ou request path.

## 7. Criterios para a proposta evoluir

- a aplicacao formal da matriz da Fase I ao candidato da Fase J passa a ser o proximo microcorte natural;
- o preenchimento documental deste microcorte nao substitui a aplicacao formal da matriz;
- nenhuma informacao pode ser inferida de harness ou teste;
- exemplos de teste nao podem virar alvo automaticamente;
- nenhum script existente pode ser usado como autorizacao;
- qualquer ambiguidade futura volta a bloquear `eligible=true`;
- qualquer ambiguidade mantem `eligible=false`;
- ausencia de evidencia mantem `eligible=false`.

## 8. Aplicacao formal da matriz da Fase I

| Campo | Valor do candidato | Resultado |
| --- | --- | --- |
| `targetId` | `fase-j-synthetic-unit-candidate-001` | atende |
| `unidadeId` | `0000000000000000000000a1` | atende |
| `dbName` | `wdgestor_unit_0000000000000000000000a1` | atende |
| `databaseKey` | `wdgestor_unit_0000000000000000000000a1` | atende |
| `environment` | `non-production` | atende |
| `targetKind` | `syntheticUnit` | atende |
| `dataClass` | `discardable` | atende |
| `trafficClass` | `none` | atende |
| `userClass` | `none` | atende |
| `portalExposure` | `none` | atende |
| `dedicatedDatabase` | `true` | atende |
| `plannedAllowlist` | `[0000000000000000000000a1]` | atende |
| `rollbackPlan` | definido documentalmente | atende |
| `evidencePlan` | definido documentalmente | atende |
| `baselinePlan` | definido documentalmente | atende |
| `ownerContextPlan` | `source=manual`, `approved=true`, `actor/reason` nao vazios | atende |

Resultado formal desta aplicacao:

- `eligible=true`.
- `blockedReasons=[]`.
- `warnings`:
- `eligible=true` e apenas elegibilidade documental;
- nao autoriza execucao;
- nao autoriza ativacao;
- nao seleciona operacionalmente alvo;
- nao cria caller real;
- nao cria rota, CLI, script, job, bootstrap ou request path;
- nao remove fallback;
- nao altera registry, writer, reader, cache, preload ou `resolveConnection`.

Leitura operacional desta aplicacao:

- o candidato satisfaz documentalmente todos os campos obrigatorios da matriz da Fase I;
- o resultado `eligible=true` nao substitui decisao documental separada sobre selecao ou nao selecao do candidato;
- qualquer execucao exigira fase ou bloco posterior explicito, baseline completa e autorizacao explicita.

## 9. Decisao documental de selecao do candidato

Candidato selecionado documentalmente:

- `fase-j-synthetic-unit-candidate-001`.

Base documental desta selecao:

- matriz da Fase I aplicada;
- `eligible=true`;
- `blockedReasons=[]`;
- candidato sintetico;
- `environment=non-production`;
- sem unidade real;
- sem dados reais;
- sem trafego real;
- sem Portal;
- sem usuario real.

Natureza desta selecao:

- selecao documental;
- selecao futura;
- nao operacional;
- nao executavel por si so;
- nao aciona writer;
- nao aciona owner;
- nao aciona entrypoint;
- nao aciona `resolveConnection`;
- nao altera registry;
- nao altera allowlist real;
- nao abre tenant DB real;
- nao muda roteamento.

Leitura operacional desta decisao:

- o candidato elegivel fica selecionado apenas como candidato futuro para validacao controlada;
- esta selecao nao equivale a execucao, ativacao ou rollout;
- esta selecao nao remove nenhum gate de seguranca herdado das Fases G, H e I.

Proximo passo recomendado a partir desta decisao:

- encerrar a Fase J documentalmente; ou
- abrir fase posterior explicita para preparacao ou validacao controlada do candidato selecionado documentalmente.

Qualquer execucao futura exigira cumulativamente:

- nova fase ou bloco explicito;
- baseline completa;
- autorizacao explicita;
- manutencao dos gates;
- plano de rollback;
- sem caller real ate autorizacao propria.

## 10. Encerramento documental da Fase J

- Fase J encerrada documentalmente.
- objetivo cumprido.
- candidato documental selecionado: `fase-j-synthetic-unit-candidate-001`.
- resultado: `eligible=true`.
- `blockedReasons=[]`.
- a selecao permanece documental, futura e nao operacional.

Leitura operacional deste encerramento:

- a Fase J abriu a fase, criou a proposta documental do candidato sintetico, preencheu os campos do candidato, aplicou formalmente a matriz da Fase I, obteve `eligible=true` e selecionou documentalmente o candidato;
- a Fase J manteve zero execucao real;
- a Fase J manteve zero superficie operacional nova.

A Fase J nao executou:

- piloto real;
- ativacao real;
- writer;
- owner;
- entrypoint;
- `resolveConnection`;
- registry real;
- allowlist real;
- tenant DB real;
- mudanca de roteamento.

A Fase J nao criou:

- caller real;
- rota;
- CLI;
- script;
- job;
- bootstrap;
- request path;
- Portal;
- PostgreSQL;
- remocao de fallback.

Proximo passo apos este encerramento:

- publicacao da Fase J somente apos baseline final completa e autorizacao explicita;
- apos publicacao, proxima fase ou bloco deve tratar preparacao ou validacao controlada do candidato selecionado documentalmente;
- qualquer execucao futura exige nova fase ou bloco explicito, baseline completa, autorizacao explicita, rollback preservado e gates mantidos.

## 11. O que a Fase J nao autoriza

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

## 12. Sequencia recomendada da Fase J

- Microcorte 1: abertura documental da Fase J;
- Microcorte 2: documento canonico da proposta de candidato;
- Microcorte 3: preenchimento documental dos campos pendentes do candidato, concluido localmente e ainda sem execucao;
- Microcorte 4: aplicacao formal da matriz da Fase I ao candidato proposto, concluida localmente com `eligible=true` documental e ainda sem execucao;
- Microcorte 5: decisao documental separada concluida localmente, selecionando o candidato elegivel apenas como candidato futuro para validacao controlada e ainda sem execucao.
- Microcorte 6: encerramento documental da Fase J, concluido localmente sem execucao e sem superficie operacional nova.
- Proximo bloco natural: fase posterior explicita de preparacao ou validacao controlada, se houver autorizacao propria.

Leitura operacional da sequencia:

- nenhum microcorte da Fase J deve criar caller real, rota, CLI, script, job, bootstrap ou request path;
- nenhum microcorte da Fase J deve operar unidade real, dados reais, trafego real ou Portal;
- qualquer continuidade futura continua dependente de baseline final completa antes de publicacao global.

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
- push apenas no fechamento global da Fase J, apos baseline final completa e autorizacao explicita.
