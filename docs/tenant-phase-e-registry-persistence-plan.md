# Fase E - Registry Persistence and Passive Read Plan

## 1. Objetivo desta subfase

- Registrar o desenho da proxima subfase da Fase E antes de qualquer implementacao tecnica.
- Preparar persistencia e leitura real passiva do registry multi-db sem ativar rollout.
- Preservar a regra central de fallback para `baseConnection` em qualquer falha, inconsistencia ou duvida.
- Evitar circularidade com `resolveConnection.js` e evitar abrir frentes de dominio, wrappers ou PostgreSQL.

## 2. Escopo proposto

Esta subfase deve permanecer document-first no inicio e cobrir apenas:

- persistencia inicial do registry no Mongo global/base atual;
- desenho da leitura real passiva do registry;
- campos minimos necessarios para a primeira leitura real;
- flags e gates operacionais que permanecem valendo;
- riscos arquiteturais e ordem recomendada dos futuros microcortes;
- plano minimo de testes antes de qualquer patch tecnico.

Esta subfase nao deve, por ora:

- ativar rollout real;
- criar seed automatizado ou provisionamento automatico;
- alterar `resolveConnection.js` amplamente;
- tocar `resolveModel.js`, `modelRegistry.js` ou `connectionFactory.js` sem necessidade estrita;
- abrir PostgreSQL;
- tocar dominio, `api.db.js`, `auth.db.js`, wrappers ou `user_memberships`.

## 3. Onde o registry deve viver inicialmente

O registry persistido deve viver inicialmente no Mongo global/base atual.

Diretriz:

- nao deve viver em tenant DB;
- nao deve usar PostgreSQL nesta fase;
- deve ser lido por conexao base/global direta;
- deve existir como camada propria de roteamento/readiness, separada do snapshot de provisioning.

Motivo:

- `resolveConnection.js` precisa consultar o registry antes de decidir se vai ou nao para tenant db;
- se o registry dependesse de tenant DB, a decisao de roteamento passaria a depender do proprio roteamento;
- isso aumentaria o risco de bootstrap circular, rollout acidental e comportamento nao deterministico.

## 4. Collection e model propostos

Proposta inicial:

- collection: `unit_database_registry`
- model: `UnitDatabaseRegistry`

Esses nomes sao diretos, evitam colisao conceitual com snapshots/eventos de provisioning e deixam claro que a colecao representa readiness e elegibilidade de roteamento por unidade.

## 5. Camada de leitura proposta

A leitura deve ser feita por camada passiva isolada sob `shared/db`.

Fluxo desejado:

1. `resolveConnection.js`
2. `unitDatabaseRegistry.js`
3. reader global passivo
4. conexao base/global direta
5. collection `unit_database_registry`

Restricoes arquiteturais:

- essa camada nao deve passar por `resolveModel.js`;
- essa camada nao deve passar por `modelRegistry.js`;
- essa camada nao deve depender de `resolveConnection.js` para obter a conexao de leitura;
- ela deve usar conexao global/base direta para evitar circularidade.

Motivo:

- evitar ciclo do tipo `resolveConnection -> unitDatabaseRegistry -> resolveModel -> resolveConnection`;
- manter o registry como fonte passiva de decisao, nunca como origem de ativacao implicita;
- garantir que erro de leitura nao colapse o runtime tenant-aware nem gere branch inesperado.

## 6. Flags e gates que permanecem

Diretriz para flags:

- reutilizar `WD_MULTI_DB_REGISTRY_READ` para a leitura persistida;
- nao criar nova flag agora;
- `WD_MULTI_DB` continua sendo o kill switch global;
- a allowlist atual continua obrigatoria.

Gates simultaneos para tenant routing:

1. `WD_MULTI_DB=1`
2. `WD_MULTI_DB_REGISTRY_READ=1`
3. registry existe
4. `readiness.ready === true`
5. `activation.active === true`
6. allowlist contem a unidade

Sem todos esses gates positivos, o destino continua sendo `baseConnection`.

## 7. Fallback e tratamento de erro

Regras obrigatorias:

- erro de leitura retorna `baseConnection`;
- registry ausente retorna `baseConnection`;
- registry inconsistente retorna `baseConnection`;
- qualquer duvida retorna `baseConnection`.

Leitura executiva:

- erro de leitura nao deve ser tratado como promocao para tenant db;
- erro de leitura nao deve ser tratado como erro fatal de roteamento nesta fase;
- a postura correta continua sendo fail-safe e fail-closed para tenant routing.

## 8. Campos minimos para a primeira leitura real

Campos minimos realmente necessarios agora:

- `unidadeId`
- `dbName`
- `databaseKey`
- `readiness.ready`
- `activation.active`
- `updatedAt`

Esses campos ja bastam para uma primeira leitura real passiva e permitem manter o restante do contrato evoluindo em passos pequenos.

## 9. Campos que continuam apenas documentais nesta subfase

Podem permanecer documentais, por ora:

- `tenantBase`
- `readiness.reason`
- `readiness.checkedAt`
- `configVersion`
- `provisioningVersion`
- `activation.allowlisted`
- `activation.activatedAt`
- `activation.deactivatedAt`
- `lastHandshake.status`
- `lastHandshake.at`
- `lastError`

Esses campos seguem uteis para o contrato final, observabilidade e trilha operacional, mas nao precisam bloquear o primeiro reader passivo real.

## 10. Riscos principais

Riscos desta subfase:

- circularidade entre `resolveConnection.js` e a camada de leitura do registry;
- rollout acidental ao introduzir persistencia real sem gates suficientes;
- acoplamento indevido com `resolveModel.js` e `modelRegistry.js`;
- erro de leitura tratado como fatal ou como promocao implicita;
- abrir model/schema/seed amplos cedo demais.

Regra de decisao em caso de duvida:

- escolher `baseConnection`.

## 11. Primeiro microcorte tecnico recomendado

Nao abrir persistencia completa de uma vez.

Sequencia recomendada:

1. teste arquitetural de erro de leitura e fallback para `baseConnection`;
2. reader global passivo minimo sob `shared/db`;
3. model/schema global minimo, se necessario para sustentar o reader;
4. somente depois discutir seed/provisionamento.

Leitura executiva:

- o primeiro microcorte seguro nao deve ser rollout;
- o primeiro microcorte seguro nao deve ser seed;
- o primeiro microcorte seguro deve provar que leitura real continua fail-safe.

Checkpoint curto de execucao ja concluido:

- o Microcorte 1 da subfase de persistencia passiva caracterizou e corrigiu o corredor em que a leitura do registry lança erro;
- com `WD_MULTI_DB_REGISTRY_READ` ligado, `resolveConnection.js` agora degrada para `baseConnection` sem deixar o erro escapar;
- nesse corredor, `useDb` nao e chamado e o handshake nao e disparado;
- o patch ficou restrito a `resolveConnection.js` e `tests/architecture/resolveConnection_multiDbFlag.test.js`;
- `unitDatabaseRegistry.js` permaneceu seam passivo minimo, sem reader real;
- nao houve model/schema, Mongo real ou logging neste microcorte;
- as validacoes focais permaneceram verdes: 14 pass na suite principal, 17 pass na suite combinada, `npm run verify:imports` verde e bateria curta com 136 pass.

Checkpoint curto adicional ja concluido:

- o Microcorte 2 da subfase de persistencia passiva caracterizou e corrigiu o corredor de registry inconsistente;
- registry inconsistente agora degrada para `baseConnection` no corredor protegido por `WD_MULTI_DB_REGISTRY_READ`;
- a inconsistência minima coberta neste ponto e: `unidadeId` divergente da unidade solicitada; entrada `ready + active` sem `dbName` nem `databaseKey`;
- nesse corredor, `useDb` nao e chamado e o handshake nao e disparado;
- o patch ficou restrito a `resolveConnection.js` e `tests/architecture/resolveConnection_multiDbFlag.test.js`;
- `unitDatabaseRegistry.js` permaneceu seam passivo minimo, sem reader real;
- nao houve model/schema ou Mongo real neste microcorte;
- os testes positivos com registry read passam a usar registry valido minimo com `dbName` e `databaseKey`;
- as validacoes focais permaneceram verdes: 15 pass na suite principal, 18 pass na suite combinada, `npm run verify:imports` verde e bateria curta com 136 pass.

Checkpoint curto adicional ja concluido:

- o Microcorte 3 da subfase de persistencia passiva criou o reader global passivo minimo do registry multi-db;
- o reader permanece isolado e ainda nao foi integrado ao fluxo principal de `resolveConnection`;
- o reader consulta diretamente a collection `unit_database_registry` pela conexao base/global;
- o reader retorna `null` quando nao encontra documento, retorna shape minimo normalizado quando encontra documento e propaga erro para o caller;
- o microcorte criou `src/shared/db/unitDatabaseRegistryReader.js` e `tests/architecture/unitDatabaseRegistryReader.test.js`;
- nao houve model/schema, seed ou rollout neste microcorte;
- nao houve alteracao em `resolveConnection.js`, `unitDatabaseRegistry.js`, `resolveModel.js` ou `modelRegistry.js`;
- os proximos passos ficam explicitamente separados: decidir em rodada propria se e como `unitDatabaseRegistry.js` passara a usar esse reader.

Checkpoint curto adicional ja concluido:

- o Microcorte 4 da subfase de persistencia passiva manteve `unitDatabaseRegistry.js` como seam sincrono;
- foi adicionado cache passivo em memoria por unidade dentro de `unitDatabaseRegistry.js`;
- foi adicionada rotina assincrona separada de preload/prime via `unitDatabaseRegistryReader.js`, sem plugar chamada async no caminho principal de `resolveConnection`;
- override de testes continua preservado e com precedencia sobre o cache;
- cache miss continua retornando `null` e erro de preload nao contamina o cache;
- `resolveConnection.js` nao foi transformado em async e continua consumindo o seam de forma sincrona;
- houve teste adicional caracterizando `resolveConnection` com cache passivo aquecido;
- nao houve model/schema, seed, rollout ou background job neste microcorte;
- nao houve alteracao em `resolveModel.js` ou `modelRegistry.js`.

Checkpoint curto de encerramento parcial da subfase:

- a subfase de persistencia passiva fechou os objetivos de fail-safe em erro de leitura do registry e fail-safe em registry inconsistente;
- a subfase fechou os objetivos de reader global passivo minimo isolado, seam `unitDatabaseRegistry.js` preservado como sincrono, cache passivo por unidade e rotina separada de preload/prime assincrono;
- a subfase fechou o objetivo de manter `resolveConnection.js` como fronteira sincrona e de caracterizar o corredor com cache passivo aquecido sem transformar o routing em async;
- antes de qualquer runtime preload, fica consolidado que preload nao roda dentro de `resolveConnection.js`, nao promove tenant routing por si so, cache frio continua significando `baseConnection` e erro de preload continua fail-safe;
- mesmo com cache aquecido, `allowlist`, `readiness.ready` e `activation.active` continuam obrigatorios;
- preload nao implica background job, refresh automatico, seed, model/schema ou rollout real;
- continuam fora de escopo: runtime preload, background job, seed, model/schema, rollout real, refresh automatico, invalidacao distribuida, alteracao ampla em `resolveConnection.js`, alteracao em `resolveModel.js`, alteracao em `modelRegistry.js`, dominio, `api.db.js`, `auth.db.js`, wrappers, PostgreSQL e `user_memberships`;
- o proximo eixo recomendado apos este encerramento parcial e uma subfase propria de runtime preload controlado para decidir quem chama `prime`, quando chama e com quais limites, sem quebrar o contrato sincrono do routing.

## 12. Plano minimo de testes antes de qualquer patch

Testes que devem existir antes ou junto dos primeiros microcortes:

- flag desligada preserva comportamento atual;
- erro de leitura do registry retorna `baseConnection`;
- documento ausente retorna `baseConnection`;
- documento invalido retorna `baseConnection`;
- `readiness.ready=false` retorna `baseConnection`;
- `activation.active!==true` retorna `baseConnection`;
- `ready + active` sem allowlist retorna `baseConnection`;
- `ready + active + allowlist` continua roteando para tenant db;
- com handshake ligado, o ping continua ocorrendo uma unica vez no caminho positivo.

## 13. Fora de escopo

Continuam fora de escopo nesta subfase:

- rollout real;
- seed ou provisionamento automatico;
- PostgreSQL;
- dominio;
- `api.db.js`;
- `auth.db.js`;
- wrappers;
- `user_memberships`;
- refatoracao ampla de `resolveConnection.js`.

## 14. Criterio para a proxima rodada tecnica

A primeira rodada tecnica desta subfase so deve ser aberta quando houver concordancia explicita com estes pontos:

- Mongo global/base como persistencia inicial;
- leitura por camada passiva isolada em `shared/db`;
- ausencia de dependencia com `resolveModel.js` e `modelRegistry.js`;
- erro de leitura degradando para `baseConnection`;
- nenhum gate atual de ativacao sendo relaxado.