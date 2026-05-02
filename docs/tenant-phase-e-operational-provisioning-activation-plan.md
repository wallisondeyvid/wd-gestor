# Fase E - Provisionamento e Ativacao Operacional do Registry Multi-DB por Unidade

## 1. Objetivo da subfase

- definir o contrato operacional da unidade desde sem registry valido ate ready e active;
- separar provisionamento, readiness e ativacao como etapas distintas;
- preservar o roteamento tenant como efeito posterior e sempre gated;
- manter preload como etapa opcional, posterior e nao decisora;
- evitar rollout implicito nesta rodada documental.

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