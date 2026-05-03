# Fase F - Ativacao Operacional Controlada Multi-DB por Unidade

## 1. Objetivo da fase

- definir o ritual operacional seguro da ativacao controlada multi-db por unidade;
- consolidar o que sera permitido e proibido antes de qualquer implementacao real;
- preservar a Fase F como frente operacional, mas ainda conservadora;
- impedir que a abertura futura nasca por atalho em request path, bootstrap, job, rota, CLI ou script solto;
- manter a Fase E como base passiva do registry, sem duplicar seus contratos tecnicos.

## 2. Estado inicial desta fase

- a Fase F comecou por teste de contrato, e nao por entrypoint operacional;
- a cadeia `unitDatabaseRegistryWriter -> registry em memoria -> reader/cache -> resolveConnection` ja esta congelada por suite focal;
- a ativacao real por unidade continua fechada;
- owner manual ainda nao foi implementado;
- entrypoint operacional ainda nao existe;
- este documento nao autoriza implementacao, rollout, piloto produtivo ou chamador novo.

## 3. Owner futuro permitido

O unico owner admissivel em fase futura e:

- funcao interna manual e deliberada;
- executada fora de request path;
- sem execucao automatica;
- sem bootstrap oportunista;
- sem background job;
- sem rota;
- sem CLI como primeiro passo;
- orientada por unidade unica ou lote explicito de `unidadeIds`;
- responsavel por registrar o resultado operacional e representar rollback sem ambiguidade.

## 4. Owners proibidos

Nao sao owners admissiveis nesta fase:

- rota admin;
- rota interna;
- request path comum;
- bootstrap automatico;
- preload automatico;
- background job;
- CLI como primeiro passo tecnico;
- script local solto como solucao principal;
- qualquer caller oportunista acoplado a leitura, cache miss, handshake ou runtime comum.

## 5. Gates obrigatorios para qualquer ativacao futura

Qualquer ativacao futura continua dependendo simultaneamente de:

- `WD_MULTI_DB=1`;
- `WD_MULTI_DB_REGISTRY_READ=1`;
- allowlist positiva para a unidade;
- `readiness.ready=true`;
- `activation.active=true`;
- `status` sem bloqueio operacional;
- `routingMode` sem bloqueio operacional;
- todos os gates adicionais ja documentados permanecendo como gate, nunca como atalho.

Leitura operacional obrigatoria:

- nenhum gate isolado libera tenant routing;
- allowlist nao substitui readiness;
- readiness nao substitui activation;
- activation nao substitui allowlist;
- flags adicionais, como handshake, continuam acessorias ao corredor e nao podem virar liberacao implicita.

## 6. Criterios minimos de piloto

Qualquer piloto futuro so pode existir se cumprir simultaneamente:

- ambiente nao produtivo;
- unidade sintetica ou espelho controlado;
- dados descartaveis;
- database dedicado;
- allowlist unitaria;
- sem Portal do Morador;
- sem trafego real;
- sem dependencia de usuarios reais;
- rollback simples, documentado e previamente testado.

Leitura operacional:

- piloto nao e rollout;
- piloto nao autoriza abertura ampla do dominio;
- piloto sem rollback simples nao pode ser iniciado.

## 7. Ritual operacional futuro minimo

Sequencia minima permitida para uma futura ativacao controlada:

1. confirmar entry existente e coerente em `pending` ou estado preparatorio seguro;
2. validar promocao para `ready` apenas quando a unidade estiver tecnicamente apta;
3. habilitar allowlist positiva apenas para a unidade do piloto;
4. promover para `active` apenas de forma explicita e deliberada;
5. validar `resolveConnection` no corredor esperado;
6. confirmar abertura da tenant connection somente no caso positivo controlado;
7. validar tambem o fallback para `baseConnection` ao remover um gate obrigatorio;
8. registrar o resultado operacional do ciclo.

Regras deste ritual:

- `pending` nao libera tenant routing;
- `ready` nao libera tenant routing;
- `active` sem os demais gates nao libera tenant routing;
- a validacao precisa cobrir o caso positivo e pelo menos um fallback seguro;
- o resultado precisa ser registrado antes de qualquer nova unidade entrar no piloto.

## 8. Rollback minimo

Rollback minimo futuro deve seguir esta ordem preferencial:

1. retirar a unidade da allowlist;
2. marcar `activation.active=false`;
3. retornar `routingMode` para `base`;
4. marcar `status` como `disabled` ou `rollback_required`;
5. confirmar fallback para `baseConnection`;
6. registrar o resultado do rollback.

Regras obrigatorias de rollback:

- nao apagar a entry como primeira acao;
- nao depender de limpeza manual difusa como mecanismo principal de seguranca;
- na duvida, preferir `baseConnection` e estado explicitamente bloqueante.

## 9. Validacoes obrigatorias antes de qualquer entrypoint futuro

Antes de qualquer proposta de entrypoint futuro, a rodada correspondente deve manter verdes, no minimo:

- `npm run verify:imports`;
- `tests/architecture/unitDatabaseRegistryWriterResolveConnection.contract.test.js`;
- `tests/architecture/resolveConnection_multiDbFlag.test.js`;
- `tests/architecture/unitDatabaseRegistryWriter.test.js`;
- `tests/architecture/unitDatabaseRegistryReader.test.js`;
- `tests/architecture/unitDatabaseRegistryCache.test.js`;
- `tests/architecture/unitDatabaseRegistryPreload.test.js`;
- baseline completa antes de qualquer push.

Leitura operacional:

- validacao curta isolada nao substitui baseline completa quando houver proposta de entrypoint;
- falha em qualquer suite bloqueia a abertura operacional;
- diff documental, sozinho, nao autoriza evolucao tecnica.

## 10. Sequencia recomendada

- primeiro, planejamento documental;
- depois, teste adicional apenas se aparecer lacuna real de contrato;
- so depois, funcao interna manual minima;
- so depois, piloto nao produtivo e unitario;
- nunca rota admin, rota interna, request path, bootstrap, job, CLI inicial ou script solto como atalho.

## 11. Limites explicitos desta fase neste momento

- nenhuma ativacao real fica aberta por este documento;
- nenhum entrypoint fica autorizado por este documento;
- nenhum dominio amplo fica reaberto por este documento;
- Fase E permanece como base passiva e tecnica do registry;
- Gestor/Core residual, Condominios amplo, Clinica e PostgreSQL permanecem fora;
- qualquer proximo passo tecnico deve continuar pequeno, controlado e reversivel.
