# Contrato do Envelope Operacional do Piloto Controlado Nao Produtivo - Fase H

## 1. Finalidade

- definir o envelope operacional obrigatorio para qualquer futuro piloto controlado nao produtivo;
- nao autorizar execucao real;
- nao criar caller real;
- nao criar superficie operacional;
- servir como pre-contrato para eventual harness ou decisao futura.

## 2. Definicao de envelope operacional

- conjunto de limites, entradas, pre-condicoes, evidencias, abortos, rollback e baseline necessarios antes de qualquer execucao;
- o envelope nao e execucao;
- o envelope nao e ferramenta;
- o envelope nao e CLI;
- o envelope nao e script;
- o envelope nao e rota;
- o envelope nao e job;
- o envelope nao e bootstrap;
- o envelope nao e request path.

## 3. Alvo admissivel futuro

- ambiente nao produtivo;
- unidade sintetica ou espelho controlado;
- dados descartaveis;
- DB dedicado;
- allowlist unitaria;
- sem usuario real;
- sem trafego real;
- sem Portal;
- rollback definido antes de qualquer execucao;
- `actor`, `reason`, `source` e `approved` explicitos;
- `databaseKey`, `dbName` e `unidadeId` coerentes.

## 4. Entradas obrigatorias do envelope

- `unidadeId`;
- `databaseKey`;
- `dbName`;
- `environment`;
- `syntheticUnit` ou `controlledMirror`;
- `dataClass=discardable`;
- `trafficClass=none`;
- `userClass=none`;
- `plannedAllowlist` unitaria;
- `rollbackPlan`;
- `successCriteria`;
- `abortCriteria`;
- `evidencePlan`;
- `baselinePlan`;
- contexto manual explicito com:
- `source=manual`;
- `approved=true`;
- `actor` nao vazio;
- `reason` nao vazio.

Leitura operacional:

- entradas obrigatorias definidas aqui nao autorizam execucao por si so;
- qualquer ausencia, incoerencia ou ambiguidade continua degradando para nao executar;
- o envelope nao substitui o entrypoint nem o owner.

## 5. Pre-condicoes obrigatorias

- Fase F publicada;
- Fase G publicada;
- Fase H aberta;
- worktree limpa;
- baseline curta verde;
- nenhum caller real;
- nenhuma rota, CLI, script, job, bootstrap ou request path;
- alvo sintetico ou controlado;
- rollback definido antes;
- allowlist unitaria planejada;
- criterios de sucesso e abortar definidos.

## 6. Evidencias obrigatorias

- relatorio do entrypoint;
- confirmacao de target sintetico ou controlado;
- confirmacao de `dataClass` descartavel;
- confirmacao de ausencia de usuario real;
- confirmacao de ausencia de trafego real;
- confirmacao de ausencia de Portal;
- confirmacao de allowlist unitaria;
- confirmacao de fallback para `baseConnection`;
- confirmacao de rollback;
- confirmacao de que `resolveConnection` decidiu routing separadamente;
- confirmacao de que o entrypoint nao decidiu routing;
- confirmacao de que nao houve caller real.

## 7. Criterios de sucesso

- todas as pre-condicoes satisfeitas;
- nenhuma superficie operacional criada;
- caso controlado passa por gates completos;
- fallback funciona;
- rollback finaliza em `baseConnection`;
- evidencias registradas;
- nenhuma unidade real envolvida;
- nenhum dado real envolvido;
- nenhum trafego real envolvido.

## 8. Criterios de abortar

- qualquer unidade real;
- qualquer dado real;
- qualquer usuario real;
- qualquer trafego real;
- qualquer uso de Portal;
- qualquer caller real;
- qualquer rota, CLI, script, job, bootstrap ou request path;
- allowlist multipla;
- ausencia de rollback;
- ausencia de `actor` ou `reason`;
- bypass do entrypoint;
- bypass do owner;
- bypass do writer;
- alteracao de `resolveConnection`;
- alteracao de fallback;
- erro em baseline;
- worktree suja antes da execucao.

## 9. Relacao com componentes existentes

- owner manual minimo: apenas orquestra writer;
- entrypoint manual minimo: valida pre-condicoes e delega ao owner;
- `resolveConnection`: unico decisor de routing;
- harness da Fase G: caracterizacao arquitetural, nao piloto real;
- envelope da Fase H: preparacao operacional, nao execucao.

## 10. Sequencia posterior recomendada

- este microcorte: contrato documental do envelope;
- proximo: decisao read-only sobre se precisa de harness de preparacao ou se a documentacao e suficiente;
- depois: se necessario, teste ou harness de preparacao, ainda sem execucao real;
- nunca avancar para execucao real sem nova decisao explicita.

## 11. Baseline do envelope

- `npm run verify:imports`;
- `node --test .\tests\architecture\unitDatabaseRegistryManualOwner.contract.test.js`;
- `node --test .\tests\architecture\unitDatabaseRegistryManualEntrypoint.contract.test.js`;
- `node --test .\tests\architecture\unitDatabaseRegistryNonProductionPilot.contract.test.js`;
- `node --test .\tests\architecture\unitDatabaseRegistryControlledPilot.contract.test.js`;
- `node --test .\tests\architecture\unitDatabaseRegistryWriterResolveConnection.contract.test.js`;
- `npm test` antes de publicacao global.