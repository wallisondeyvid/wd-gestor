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