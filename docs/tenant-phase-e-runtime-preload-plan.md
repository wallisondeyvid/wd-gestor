# Fase E - Runtime Preload Controlado do Registry Multi-DB

## 1. Objetivo desta subfase

- definir o desenho do runtime preload controlado do registry multi-db;
- aquecer o cache de registry de forma explicita e controlada;
- preservar integralmente o contrato sincrono de routing atual;
- evitar rollout acidental, bootstrap implicito ou promocao indireta para tenant routing.

## 2. Principios

- preload nao roda dentro de `resolveConnection.js`;
- preload nao transforma `resolveConnection.js` em async;
- preload nao promove tenant routing por si so;
- preload nao substitui allowlist;
- preload nao substitui `readiness.ready`;
- preload nao substitui `activation.active`;
- cache frio continua sendo estado seguro;
- erro de preload nao deve derrubar a aplicacao nem contaminar o cache.

Principio adicional de autoridade operacional:

- preload nunca e owner operacional do registry.

## 3. Desenho pretendido

Diretriz da subfase:

- criar futuramente um servico dedicado de preload por lista de unidades;
- esse servico deve chamar `primeUnitDatabaseRegistryCache` ou API equivalente ja existente no seam;
- esse servico deve retornar relatorio operacional por lote;
- esse servico nao deve decidir roteamento.

Leitura executiva:

- o preload passa a ser aquecimento explicito de cache, nao decisao de routing;
- `resolveConnection.js` continua apenas consumindo o seam sincrono;
- tenant routing continua dependente dos gates ja existentes.

Limites adicionais obrigatorios:

- preload nunca escreve registry;
- preload nunca ativa registry;
- preload nunca muda status;
- preload nunca mexe em allowlist.

## 4. Contrato minimo futuro do servico

Entrada minima:

- lista explicita de `unidadeIds`.

Saida minima:

- `loaded`;
- `missing`;
- `failed`;
- opcionalmente `skipped` para ids invalidos ou duplicados.

Regras operacionais do contrato:

- falha em uma unidade nao deve derrubar o lote inteiro;
- erro global deve ser tratado de forma fail-safe;
- o relatorio deve permitir leitura objetiva do que foi aquecido, do que nao foi encontrado e do que falhou.

## 5. Limites desta subfase

Continuam fora de escopo nesta etapa:

- boot automatico;
- background job;
- refresh automatico;
- invalidacao distribuida;
- seed;
- model/schema;
- rollout real;
- alteracao em `resolveConnection.js`;
- alteracao em `resolveModel.js`;
- alteracao em `modelRegistry.js`;
- dominio;
- `api.db.js`;
- `auth.db.js`;
- wrappers;
- PostgreSQL;
- `user_memberships`.

## 6. Sequencia sugerida de microcortes

1. microcorte 1: documento canonico da subfase;
2. microcorte 2: servico explicito de preload por lista, ainda sem boot automatico;
3. microcorte 3: testes de relatorio `loaded/missing/failed/skipped`;
4. microcorte 4: decisao posterior sobre ponto operacional de chamada.

Diretriz adicional:

- boot automatico, background job e refresh ficam para subfase futura, se ainda fizerem sentido depois dos microcortes controlados.

## 6.1 Checkpoint curto do microcorte tecnico 1

- o primeiro microcorte tecnico desta subfase foi concluido;
- foi criado servico explicito de preload por lista de unidades;
- o servico usa o seam existente `primeUnitDatabaseRegistryCache`;
- o servico retorna relatorio `loaded`, `missing`, `failed` e `skipped`;
- `loaded` ocorre quando prime retorna entry;
- `missing` ocorre quando prime retorna null;
- `failed` ocorre quando prime lanca erro sem derrubar o lote;
- `skipped` cobre unidade ausente, invalida ou duplicada;
- o servico nao decide routing;
- o servico nao chama `resolveConnection.js`;
- o servico nao chama `resolveModel.js` nem `modelRegistry.js`;
- o servico nao cria conexao direta;
- nao houve boot automatico;
- nao houve background job;
- nao houve refresh automatico;
- nao houve seed;
- nao houve model/schema;
- nao houve rollout real.

## 6.2 Checkpoint curto do contrato estabilizado do relatorio

- loaded permanece como array de unidadeIds normalizados;
- missing permanece como array de unidadeIds normalizados;
- skipped passa a ser array de objetos `{ input, reason }`;
- failed passa a ser array de objetos `{ unidadeId, reason, error }`.

Reasons consolidados:

- skipped usa `missing-unidade-id`;
- skipped usa `invalid-unidade-id`;
- skipped usa `duplicate-unidade-id`;
- failed usa `prime-failed`.

Limites preservados neste checkpoint:

- o servico segue sem decidir routing;
- o servico segue sem chamar `resolveConnection.js`;
- o servico segue sem wrapper operacional;
- nao houve boot automatico;
- nao houve background job;
- nao houve refresh automatico;
- nao houve rollout real;
- nao houve seed;
- nao houve model/schema.

## 6.3 Checkpoint curto de pausa e encerramento parcial

- o servico explicito de preload por lista fica concluido no escopo atual da subfase;
- o contrato do relatorio fica estabilizado no escopo atual da subfase;
- nao foi identificado owner operacional manual pequeno, explicito e seguro no codigo atual;
- por isso a subfase permanece sem caller operacional por enquanto.

Limites preservados neste checkpoint:

- nao havera wrapper manual nesta rodada;
- nao havera script, CLI, rota ou admin interno nesta rodada;
- nao havera boot automatico;
- nao havera background job;
- nao havera refresh automatico;
- nao havera rollout real.

Diretriz consolidada apos esta pausa:

- qualquer ponto operacional futuro deve nascer em subfase propria, apos identificar owner real;
- o candidato mais proximo continua sendo contexto futuro de rollout ou provisioning, mas permanece fora agora para evitar rollout implicito.

## 6.4 Checkpoint curto do contrato futuro de owner operacional/manual

- esta rodada nao implementa owner operacional/manual;
- esta rodada define apenas o contrato do owner futuro admissivel para preload e escrita do registry;
- o owner futuro admissivel deve nascer como contexto manual e explicito de provisioning/ativacao operacional por unidade, nunca como efeito colateral do runtime de requests;
- esse owner futuro nao pode residir em `resolveConnection.js`, nem no proprio servico de preload, nem em bootstrap automatico, job, rota, CLI ou admin interno aberto por conveniencia;
- o menor ponto futuro de chamada continua sendo uma etapa manual e deliberada do corredor de provisioning/ativacao, com lista explicita de `unidadeIds` e intencao operacional inequívoca;
- preload futuro so pode ser chamado por esse owner futuro depois de decidir explicitamente quais unidades entram no lote;
- preload futuro continua proibido em fluxo automatico de boot, request path, cache miss, handshake, leitura passiva ou retry implicito;
- a escrita futura do registry tambem so pode nascer sob esse mesmo owner futuro ou sob servico dedicado chamado por ele, sempre fora do routing sync;
- escrita futura do registry nao podera ativar tenant routing sozinha;
- readiness futura nao podera ativar tenant routing sozinha;
- activation continuara explicita e allowlist continuara como gate operacional simultaneo.

Reforcos explicitos deste contrato:

- o servico de preload, por si so, nunca escreve, nunca ativa, nunca muda status e nunca altera allowlist;
- qualquer tentativa futura de usar preload como ponto de decisao operacional deve ser tratada como violacao deste contrato documental.

Contrato minimo futuro do owner:

- entrada minima: operador/contexto manual explicito, motivo operacional, lista explicita de `unidadeIds` e acao pretendida;
- saida minima: relatorio deterministico por unidade, sem promocao automatica para tenant routing;
- invariantes minimos: `unidadeId` valido, escrita e leitura via base/global, `routingMode=base` como default seguro, `activation.active=false` ate liberacao explicita posterior, e rollback sempre preferindo `disabled` ou `rollback_required`.

Rollback operacional futuro:

- em erro, duvida ou inconsistência, o retorno seguro continua sendo `baseConnection`;
- o owner futuro deve preferir marcar `disabled` ou `rollback_required`, com `routingMode=base` e `activation.active=false`;
- remocao ambigua do registry nao e rollback aceitavel neste corredor.

## 7. Riscos

Riscos principais desta subfase:

- confundir cache aquecido com ativacao tenant;
- criar preload implicito no routing;
- introduzir async em `resolveConnection`;
- aquecer cache sem politica operacional clara;
- fazer rollout acidental.

## 8. Garantias

- na duvida, `baseConnection`;
- cache frio e seguro;
- erro de preload e seguro;
- routing continua protegido por `WD_MULTI_DB`, `WD_MULTI_DB_REGISTRY_READ`, allowlist, `readiness.ready` e `activation.active`.

## 9. Primeiro microcorte tecnico provavel

O primeiro microcorte tecnico seguro desta subfase deve ser:

- criar um servico explicito de preload por lista de unidades, ainda sem boot automatico, sem background job e sem impacto no contrato sincrono de routing.