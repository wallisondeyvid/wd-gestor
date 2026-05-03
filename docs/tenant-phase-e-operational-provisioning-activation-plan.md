# Fase E - Provisionamento e Ativacao Operacional do Registry Multi-DB por Unidade

## 1. Objetivo da subfase

- definir o contrato operacional da unidade desde sem registry valido ate ready e active;
- separar provisionamento, readiness e ativacao como etapas distintas;
- preservar o roteamento tenant como efeito posterior e sempre gated;
- manter preload como etapa opcional, posterior e nao decisora;
- evitar rollout implicito nesta rodada documental.

## 1.1 Documento canonico do owner manual

- este documento passa a ser a referencia canonica do owner operacional/manual do registry multi-db da Fase E;
- o owner manual nasce aqui como procedimento operacional explicito de provisioning/ativacao por unidade, e nao como implementacao tecnica nesta rodada;
- runtime, preload, request path e bootstrap nunca sao owner operacional do registry;
- esta rodada consolida contrato, invariantes, estados, gates e rollback, sem autorizar script, rota, job, schema, model, seed ou qualquer executor real.

## 1.2 Owner operacional/manual do registry

Owner legitimo nesta fase:

- um procedimento operacional explicito e deliberado de provisioning/ativacao por unidade;
- executado fora do runtime comum de requests;
- orientado por lote explicito de `unidadeIds` quando houver acao em mais de uma unidade;
- responsavel por escrever ou atualizar a entry em estado seguro, conduzir validacao tecnica, decidir readiness, decidir activation e representar rollback sem ambiguidade.

O owner manual nao pode nascer de:

- runtime comum;
- preload;
- request path;
- bootstrap automatico;
- efeito lateral de leitura;
- rota;
- CLI;
- job;
- admin interno oportunista.

## 1.3 Checkpoint do bloco tecnico do writer manual

- o bloco tecnico do writer manual do registry multi-db fica concluido neste checkpoint como seam tecnico de escrita e transicao sob shared/db;
- esse writer opera somente pela conexao base/global e escreve apenas na collection `unit_database_registry`;
- esse writer nao e owner operacional/manual, nao e rota, nao e CLI, nao e job, nao e bootstrap e nao e request path;
- esse writer nao chama preload, nao chama `resolveConnection`, nao chama `resolveModel` nem `modelRegistry`, nao abre conexao tenant diretamente, nao testa handshake tenant e nao mexe em allowlist;
- allowlist permanece como gate operacional externo e simultaneo, e o writer nao substitui esse gate;
- o writer tambem nao faz rollout e nao faz provisionamento fisico do database da unidade;
- o escopo do writer fica restrito a materializar transicoes manuais explicitas do registry: `pending`, `ready`, `disabled`, `rollback_required` e `active`;
- a transicao `ready -> active` fica consolidada como promocao apenas de entry coerente, exigindo `dbName`, `databaseKey`, `readiness.ready=true`, `routingMode=base` e `activation.active=false`, com idempotencia admitida somente para `active` ja coerente;
- o proximo passo desta trilha, se houver continuidade, nao e runtime: e escolher ou definir um entrypoint operacional/manual explicito e seguro para esse owner; sem esse enquadramento, o bloco tecnico pode permanecer encerrado por aqui.

## 1.4 Pausa formal do bloco tecnico

- a Fase E fica pausada formalmente neste ponto como bloco tecnico concluido;
- o writer manual existe, mas nao ha owner operacional/manual nem entrypoint implementado para chama-lo agora;
- nao deve nascer neste momento rota, CLI, job, bootstrap, request path ou qualquer caller oportunista para esse writer;
- allowlist permanece gate externo separado;
- runtime, reader/cache e preload permanecem passivos;
- qualquer continuidade futura deve abrir uma subfase propria, primeiro documental, para decidir explicitamente se existe necessidade real de um entrypoint operacional/manual e qual seria o menor formato seguro.

## 2. Fluxo operacional canonico

Fluxo minimo recomendado para a unidade:

1. unidade sem registry valido;
2. registro inicial pendente em modo base;
3. provisionamento tecnico do database da unidade;
4. validacao tecnica e de consistencia do registry;
5. transicao para ready;
6. ativacao explicita da unidade;
7. roteamento tenant somente quando todos os gates positivos estiverem satisfeitos;
8. preload apenas como etapa opcional e posterior.

Leitura operacional obrigatoria:

- criar ou provisionar unidade nao libera tenant routing por si so;
- readiness validada nao libera tenant routing por si so;
- ativacao explicita ainda nao substitui os gates globais existentes;
- preload nao e parte obrigatoria do fluxo minimo.

Checkpoint curto do fluxo tecnico ja publicado:

- o writer manual ja consegue registrar `pending`, promover para `ready`, forcar `disabled`, marcar `rollback_required` e promover `ready` coerente para `active`;
- esse bloco continua puramente tecnico e nao introduz chamador humano/operacional nesta rodada.

## 2.1 Entry minima obrigatoria

Campos minimos obrigatorios para uma entry operacionalmente valida:

- `unidadeId`;
- `dbName`;
- `databaseKey`;
- `status`;
- `routingMode`;
- `readiness.ready`;
- `activation.active`;
- `updatedAt`.

Campos fortemente recomendados, mas ainda nao obrigatorios para liberar este contrato documental:

- `readiness.reason`;
- `activation.activatedAt`;
- `activation.deactivatedAt`;
- `lastError`.

Regras minimas de interpretacao:

- `readiness.ready` = elegibilidade tecnica;
- `activation.active` = autorizacao operacional explicita;
- allowlist = gate operacional externo e simultaneo;
- nenhum dos tres, isoladamente, ativa tenant routing.

## 3. Estados operacionais do registry

- `not_configured`
- `pending`
- `provisioning`
- `ready`
- `active`
- `failed`
- `rollback_required`
- `disabled`

Leitura executiva dos estados:

- `not_configured` representa ausencia de registry valido;
- `pending` representa intencao registrada sem provisionamento concluido;
- `provisioning` representa execucao tecnica em andamento;
- `ready` representa aptidao tecnica validada sem liberacao operacional;
- `active` representa elegibilidade operacional explicita;
- `failed` representa falha tecnica ou de consistencia;
- `rollback_required` representa necessidade de retorno deliberado para base;
- `disabled` representa bloqueio operacional explicito sem apagar metadado.

## 4. Transicoes permitidas

- `not_configured -> pending`
- `pending -> provisioning`
- `provisioning -> ready`
- `provisioning -> failed`
- `ready -> active`
- `ready -> rollback_required`
- `active -> disabled`
- `active -> rollback_required`
- `failed -> pending` apenas por reprocesso deliberado
- `rollback_required -> pending` apenas por recuperacao deliberada

Regras de transicao:

- `ready` nao implica `active`;
- `active` nao implica rollout amplo;
- reprocesso e recuperacao devem ser deliberados e nunca implicitos;
- qualquer transicao fora desta lista deve ser tratada como estado invalido e degradada para base.

## 4.1 Tabela de estados e transicoes

| Estado | Significado operacional | Transicoes permitidas | Observacoes |
| --- | --- | --- | --- |
| `not_configured` | ausencia de registry valido | `pending` | estado apenas documental ou anterior ao primeiro registro seguro |
| `pending` | intencao registrada em estado seguro | `provisioning`, `failed`, `disabled` | permanece em base e sem ativacao |
| `provisioning` | execucao tecnica em andamento | `ready`, `failed`, `rollback_required` | nao promove tenant routing |
| `ready` | elegibilidade tecnica validada sem liberacao operacional | `active`, `disabled`, `rollback_required`, `failed` | `ready` nao ativa tenant por si so |
| `active` | autorizacao operacional explicita | `disabled`, `rollback_required`, `failed` | ainda depende de gates simultaneos |
| `disabled` | bloqueio operacional explicito | `pending` | retorno seguro e deliberado para base |
| `rollback_required` | inconsistência ou falha exigindo retorno controlado | `pending`, `disabled` | nao pode promover tenant routing |
| `failed` | falha tecnica ou de consistencia | `pending`, `disabled` | so sai por reprocesso deliberado |

## 4.2 Transicoes proibidas

- `pending -> active`;
- `provisioning -> active`;
- `failed -> active`;
- `rollback_required -> active`;
- `disabled -> active`;
- qualquer transicao induzida automaticamente por cache aquecido, preload, leitura passiva, request path ou bootstrap;
- qualquer promocao para tenant routing sem gates simultaneos positivos.

## 5. Definicao de provisionar

Provisionar significa:

- preparar ou criar o database tecnico da unidade;
- registrar vinculo estavel `unidadeId -> dbName/databaseKey`;
- persistir metadado suficiente para futura leitura passiva;
- manter a unidade em ramo seguro ate validacao posterior.

Provisionar nao significa:

- liberar tenant routing;
- marcar a unidade como `active` automaticamente;
- chamar preload automaticamente;
- criar rollout implicito.

## 6. Definicao de readiness

Readiness significa:

- registry legivel pela base global;
- `unidadeId` consistente com a unidade alvo;
- `dbName` e `databaseKey` presentes;
- prova tecnica minima do alvo concluida com sucesso;
- estado apto a futura avaliacao de ativacao.

Readiness nao significa:

- ativacao operacional;
- bypass de allowlist;
- bypass de `WD_MULTI_DB`;
- bypass de `WD_MULTI_DB_REGISTRY_READ`;
- bypass de handshake quando habilitado.

Leitura consolidada:

- `readiness.ready=true` apenas declara elegibilidade tecnica;
- `readiness.ready=true` sem `activation.active=true` continua retornando `baseConnection`;
- `readiness.ready=true` sem allowlist positiva continua retornando `baseConnection`.

## 7. Definicao de activation

Activation significa:

- elegibilidade operacional explicita da unidade para seguir no corredor tenant;
- intencao deliberada de permitir avaliacao positiva no routing;
- manutencao do registry como fonte de estado operacional por unidade.

Activation nao substitui:

- `WD_MULTI_DB`;
- `WD_MULTI_DB_REGISTRY_READ`;
- allowlist;
- handshake quando habilitado.

Leitura operacional:

- `activation.active=true` sem os demais gates continua insufficiente para promover tenant routing;
- `activation.active=false` ou ausente continua significando fallback para `baseConnection`.

## 7.1 Condicoes minimas antes de `activation.active=true`

- entry existente e consistente para a unidade alvo;
- `unidadeId` canonico e valido;
- `dbName` e `databaseKey` definidos de forma deterministica;
- escrita e leitura ocorrendo pela conexao base/global;
- `routingMode=base` enquanto a unidade ainda nao foi deliberadamente promovida;
- validacao tecnica concluida;
- `readiness.ready=true` somente apos essa validacao;
- status nao bloqueante para o corredor operacional;
- allowlist preparada como gate externo e simultaneo;
- ausencia de erro, duvida ou inconsistência no registro.

## 7.2 Entrada e saida da allowlist

Uma unidade so deve entrar na allowlist quando:

- a entry estiver consistente;
- a validacao tecnica minima tiver sido concluida;
- `readiness.ready=true` ja puder ser sustentado;
- ainda houver decisao operacional deliberada de preparar ativacao.

Uma unidade deve sair da allowlist quando:

- houver rollback;
- houver falha ou inconsistência relevante;
- `status` migrar para `disabled` ou `rollback_required`;
- `activation.active` voltar para `false` por retorno seguro deliberado.

Regra central:

- allowlist participa da ativacao como gate externo e simultaneo;
- allowlist nao substitui readiness;
- allowlist nao substitui activation;
- allowlist isolada nunca ativa tenant routing.

## 8. Papel do preload

O preload nesta fase:

- nao provisiona;
- nao valida readiness;
- nao ativa;
- nao decide routing;
- apenas aquece cache.

Diretriz operacional:

- preload continua opcional;
- preload continua posterior a readiness e ativacao;
- preload continua separado do contrato sincrono de routing;
- owner operacional do preload permanece indefinido nesta subfase.

## 9. Invariantes e fail-safes

- sem registry valido, `baseConnection`;
- sem `readiness.ready === true`, `baseConnection`;
- sem `activation.active === true`, `baseConnection`;
- sem allowlist efetiva, `baseConnection`;
- erro de leitura do registry, `baseConnection`;
- registry inconsistente, `baseConnection`;
- cache aquecido nao substitui gates;
- preload nunca substitui activation;
- preload nunca substitui allowlist;
- provisionamento bem-sucedido nao ativa tenant automaticamente;
- readiness validada nao ativa tenant automaticamente.

Invariantes adicionais do contrato manual:

- o runtime nunca inventa transicao de estado;
- o preload nunca promove estado;
- o request path nunca escreve nem ativa registry;
- rollback nunca deve depender de remocao ambigua da entry;
- o retorno seguro e representado por `routingMode=base`, `activation.active=false` e saida da allowlist;
- `disabled` ou `rollback_required` sao a representacao preferencial de rollback.

## 9.1 Rollback representado, nunca por remocao ambigua

Rollback seguro deve ser representado por:

- `status=disabled` ou `status=rollback_required`;
- `routingMode=base`;
- `activation.active=false`;
- saida da allowlist;
- manutencao da entry como metadado explicito e auditavel.

Rollback nao deve ser representado por:

- apagar a entry sem rastro semantico;
- depender de cache frio para sugerir retorno seguro;
- deixar status ou activation em estado ambiguo.

## 10. Riscos

- confundir `ready` com `active`;
- transformar provisionamento tecnico em rollout operacional;
- promover preload a owner de ativacao;
- criar ponto operacional implicito antes de existir owner real;
- misturar metadado de registry com decisao de rollout por conveniencia.

## 11. Fora de escopo

- rollout real;
- escrita real em producao;
- seed;
- model/schema, salvo decisao documental futura;
- background job;
- boot automatico;
- refresh automatico;
- invalidacao distribuida;
- rota ou admin interno;
- CLI;
- alteracao em `resolveConnection.js`;
- alteracao em `resolveModel.js`;
- alteracao em `modelRegistry.js`;
- alteracao em `unitDatabaseRegistry.js`;
- alteracao em `unitDatabaseRegistryReader.js`;
- alteracao em `unitDatabaseRegistryPreload.js`;
- alteracao em `auth.db.js`;
- alteracao em `api.db.js`;
- dominio;
- wrappers amplos;
- PostgreSQL;
- `user_memberships`.

Fora de escopo adicional desta rodada:

- implementar o owner manual;
- criar executor do owner manual;
- interpretar este documento como autorizacao para runtime, preload, request path ou bootstrap assumirem papel operacional.

## 12. Primeiro microcorte seguro sugerido apos o documento

O primeiro microcorte seguro sugerido apos esta rodada documental deve continuar pequeno e contratual.

Opcao recomendada:

- caracterizar em teste arquitetural que ativacao operacional incompleta ou incoerente continua fail-safe para `baseConnection`, sem reabrir routing amplo e sem introduzir escrita real.

Leitura executiva:

- o primeiro microcorte futuro nao deve criar owner operacional;
- o primeiro microcorte futuro nao deve criar rollout;
- o primeiro microcorte futuro deve apenas endurecer o contrato operacional ao redor de activation e consistencia do registry.

## 12.1 Checkpoint curto do primeiro microcorte tecnico

- o primeiro microcorte tecnico desta subfase foi concluido;
- o corredor protegido agora trata routingMode explicito diferente de tenant, especialmente routingMode=base, como inconsistencia operacional para tenant routing;
- esse bloqueio vale mesmo quando readiness.ready=true, activation.active=true, unidadeId esta consistente, dbName/databaseKey estao presentes e a allowlist permite a unidade;
- nesse corredor contraditorio, resolveConnection permanece em baseConnection;
- nesse corredor contraditorio, useDb nao e chamado;
- nesse corredor contraditorio, o handshake nao e disparado.

Limites preservados neste checkpoint:

- routingMode ausente preserva o comportamento anterior neste corte;
- status continua fora deste microcorte;
- configVersion continua fora deste microcorte;
- nao houve alteracao em reader, cache ou preload;
- nao houve provisionamento real nem rollout real.

## 12.2 Checkpoint curto do segundo microcorte tecnico

- o segundo microcorte tecnico desta subfase foi concluido;
- o reader real do registry agora propaga routingMode quando o documento persistido contem esse campo;
- o prime/cache agora preserva routingMode quando o entry vem do reader real;
- com isso, routingMode deixa de ser apenas campo aceito por override de teste ou cache manual aquecido;
- o fail-safe de routingMode=base passa a ficar coberto tambem no caminho persistido real ate resolveConnection;
- nesse corredor persistido contraditorio, resolveConnection permanece em baseConnection;
- nesse corredor persistido contraditorio, useDb nao e chamado;
- nesse corredor persistido contraditorio, o handshake nao e disparado.

Limites preservados neste checkpoint:

- status continua fora deste microcorte;
- configVersion continua fora deste microcorte;
- nao houve alteracao em resolveConnection.js;
- nao houve alteracao em schema, model ou escrita real do registry;
- nao houve provisionamento real nem rollout real.

## 12.3 Checkpoint curto do terceiro microcorte tecnico

- o terceiro microcorte tecnico desta subfase foi concluido;
- status explicito do registry agora atravessa o reader real quando presente no documento persistido;
- o prime/cache agora preserva status no caminho passivo real;
- com isso, status deixa de ser apenas campo documental e passa a participar do corredor protegido de routing;
- status explicito diferente de active passa a bloquear tenant routing como inconsistencia operacional;
- status=ready nao promove tenant routing mesmo quando readiness.ready=true, activation.active=true e a allowlist permite a unidade;
- failed, rollback_required e disabled forcam baseConnection mesmo quando readiness.ready=true e activation.active=true;
- status=active continua permitindo o corredor positivo quando os demais gates permanecem positivos;
- status ausente preserva compatibilidade temporaria e mantem o comportamento anterior neste ponto.

Limites preservados neste checkpoint:

- configVersion continua fora deste microcorte;
- nao houve alteracao em schema, model ou escrita real do registry;
- nao houve provisionamento real nem rollout real;
- nao houve abertura de maquina de estados nem validacao de transicoes.

## 12.4 Checkpoint curto de pausa tecnica e encerramento parcial

- os contratos negativos essenciais do corredor operacional desta subfase tecnica ficam encerrados parcialmente neste checkpoint;
- routingMode explicito contraditorio ja bloqueia tenant routing no corredor protegido;
- routingMode e status agora atravessam o reader real e o prime/cache no caminho passivo real;
- status explicito diferente de active ja bloqueia tenant routing como inconsistencia operacional;
- status=ready nao promove tenant routing;
- failed, rollback_required e disabled ja forcam baseConnection;
- status ausente permanece como compatibilidade temporaria deliberada neste ponto;
- a pausa tecnica desta subfase passa a ser deliberada apos tres microcortes pequenos, locais e validados.

Leitura executiva deste checkpoint:

- configVersion permanece deliberadamente fora desta subfase tecnica e so deve voltar como corte futuro se surgir necessidade concreta de compatibilidade de contrato no runtime;
- qualquer proximo passo tecnico desta trilha deve nascer de nova rodada propria, e nao como continuacao automatica destes tres microcortes;
- a regua atual permanece fechada sem schema, sem model, sem escrita real, sem provisionamento real, sem rollout real, sem maquina de estados e sem validacao de transicoes.

## 12.5 Checkpoint curto do contrato futuro de owner/manual

- a proxima etapa desta trilha fica redefinida como bloco document-first sobre owner operacional/manual futuro, e nao como implementacao direta;
- o owner futuro admissivel passa a ser somente um contexto manual e explicito de provisioning/ativacao operacional por unidade;
- esse owner futuro nao pode nascer de preload automatico, bootstrap, request path, rota, CLI, job, admin interno oportunista ou efeito lateral de leitura;
- preload futuro so podera ser chamado por esse owner futuro, por lista explicita de `unidadeIds` e sem virar rollout implicito;
- escrita futura do registry so podera nascer sob esse owner futuro ou por servico dedicado chamado por ele, sempre fora do corredor sync de routing;
- escrita futura do registry nao podera ativar tenant routing sozinha;
- readiness futura nao podera ativar tenant routing sozinha;
- activation continua explicita, allowlist continua obrigatoria e erro, duvida ou inconsistência continuam resultando em `baseConnection`.

Ordem operacional futura consolidada:

1. escrever ou atualizar registry em estado seguro;
2. aquecer cache apenas se houver lote manual explicito;
3. concluir validacao tecnica antes de `readiness.ready=true`;
4. manter `activation.active=false` ate liberacao deliberada;
5. so admitir tenant routing com gates positivos simultaneos e sem contradicoes de status ou routingMode.

Rollback operacional futuro consolidado:

- o owner futuro deve preferir `disabled` ou `rollback_required`, com `routingMode=base` e `activation.active=false`;
- remocao ambigua do registry nao conta como rollback aceitavel;
- qualquer automacao futura deve nascer em subfase propria posterior.