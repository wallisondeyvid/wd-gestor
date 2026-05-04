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

## 12. Checkpoint de contrato ja realizado

- o rollback operacional da Fase F ja foi caracterizado por contrato, sem ativacao real e sem uso de unidade real;
- a cadeia caracterizada permanece `unitDatabaseRegistryWriter -> registry em memoria -> reader/cache -> resolveConnection`;
- a mesma unidade active coerente volta para `baseConnection` quando perde allowlist, quando volta para `disabled`, quando volta para `rollback_required`, quando volta para `routingMode=base` e quando perde `activation.active`;
- o rollback via writer preserva a entry e nao apaga o registro como primeira acao;
- o corredor permaneceu fail-safe com `WD_MULTI_DB` e `WD_MULTI_DB_REGISTRY_READ` ligados;
- esse checkpoint nao abre ativacao real, nao cria owner manual, nao cria entrypoint e nao altera a regra de acumulacao local dos microcortes da Fase F ate fechamento global ou autorizacao explicita.

## 13. Checkpoint de piloto controlado ja realizado

- o piloto controlado da Fase F ja foi caracterizado por contrato, em harness sintetico e sem uso de unidade real;
- o fluxo caracterizado usa apenas `unitDatabaseRegistryWriter`, registry em memoria, reader/cache e `resolveConnection`;
- o piloto sintetico comeca em `baseConnection` sem entry ativa; `pending` nao abre tenant; `ready` sem `activation.active` nao abre tenant; `active` sem allowlist positiva nao abre tenant; `active` com allowlist positiva abre tenant connection; remocao da allowlist, `disabled` e `rollback_required` encerram o piloto com retorno para `baseConnection`;
- esse checkpoint nao abre ativacao real, nao cria owner manual, nao cria entrypoint e nao altera a regra de acumulacao local dos microcortes da Fase F ate fechamento global ou autorizacao explicita.

## 14. Contrato documental minimo do owner interno manual futuro

Base passiva de referencia:

- a Fase E permanece como base passiva do ciclo de vida, do writer e dos estados do registry, especialmente em `tenant-phase-e-operational-provisioning-activation-plan.md`;
- a Fase F nao reimplementa esse bloco: ela apenas fecha a fronteira operacional do futuro owner manual minimo antes de qualquer implementacao.

Definicao do owner futuro:

- o owner admissivel na Fase F continua sendo uma funcao interna manual, deliberada e autorizada;
- essa funcao deve ser chamada fora de request path e sem exposicao HTTP;
- essa funcao nao deve nascer como rota, CLI, script local solto, job, bootstrap automatico, preload automatico ou caller oportunista do runtime comum;
- este microcorte nao implementa o owner, nao cria entrypoint e nao autoriza execucao real.

Responsabilidades permitidas:

- orquestrar explicitamente a sequencia `pending -> ready -> active` quando todas as pre-condicoes estiverem satisfeitas;
- validar os gates obrigatorios antes da promocao para `active`;
- registrar a intencao operacional e o resultado do ciclo;
- chamar apenas o writer ja existente como seam de transicao;
- representar rollback sem ambiguidade quando houver falha, duvida ou encerramento do piloto;
- preservar a cadeia `unitDatabaseRegistryWriter -> registry em memoria -> reader/cache -> resolveConnection` como corredor contratual ja caracterizado.

Responsabilidades proibidas:

- nao decidir tenant routing sozinho;
- nao abrir tenant connection sem allowlist positiva e sem os demais gates simultaneos;
- nao ignorar `readiness.ready`, `activation.active`, `status` ou `routingMode`;
- nao escrever a entry diretamente como atalho fora do writer;
- nao remover o fallback fail-safe para `baseConnection`;
- nao operar dados reais, unidade real ou trafego real nesta fase.

Pre-condicoes minimas antes de qualquer owner futuro:

- ambiente nao produtivo;
- unidade sintetica ou espelho controlado;
- database dedicado;
- allowlist unitaria positiva apenas para a unidade alvo;
- `WD_MULTI_DB=1` e `WD_MULTI_DB_REGISTRY_READ=1`, com flags adicionais obrigatorias quando o corredor exigir;
- baseline verde e suites focais da Fase F preservadas;
- plano de rollback definido antes da ativacao controlada.

Pos-condicoes minimas esperadas:

- `resolveConnection` so confirma tenant quando todos os gates passam simultaneamente;
- remocao da allowlist faz a unidade voltar para `baseConnection`;
- `disabled` e `rollback_required` fazem a unidade voltar para `baseConnection`;
- a entry nao e apagada como primeira acao de rollback;
- o resultado do ciclo fica registrado documentalmente.

Proximo passo permitido, ainda sem implementacao:

- antes de implementar o owner, o proximo microcorte pode ser apenas ampliar a documentacao ou criar teste de contrato focal do owner futuro;
- se houver implementacao posterior, ela deve nascer como funcao interna minima, coberta por teste, e ainda sem rota, CLI, script, job, bootstrap ou request path;
- os commits desta frente continuam locais, sem push, ate o fechamento global da Fase F ou autorizacao explicita.

## 15. Checkpoint de contrato testado do owner interno manual futuro

- o contrato do owner interno manual futuro da Fase F agora tambem esta caracterizado por teste, sem implementacao de owner real e sem uso de unidade real;
- a caracterizacao foi feita em suite arquitetural propria, por helper local de teste, sem criar modulo de producao, sem export publico e sem virar API de runtime;
- o helper aceita apenas contexto manual explicito com `source=manual`, `approved=true`, `reason` nao vazia e `actor` nao vazio, e recusa caller automatico, oportunista, request path, rota, CLI, script, job e bootstrap;
- a orquestracao caracterizada usa apenas funcoes publicas do writer para `pending -> ready -> active`, sem escrita direta do registry e sem burlar writer, reader/cache ou `resolveConnection`;
- mesmo apos `active`, a abertura de tenant continua dependente dos gates existentes e da allowlist positiva; sem allowlist, o corredor permanece em `baseConnection`; rollback via writer continua retornando para `baseConnection` com fail-safe preservado;
- esse checkpoint nao implementa owner real, nao cria entrypoint, nao cria rota, nao cria CLI, nao cria script, nao cria job e nao altera a regra de acumulacao local dos microcortes da Fase F ate fechamento global ou autorizacao explicita.

## 16. Checkpoint de owner interno manual minimo implementado

- a Fase F agora tem owner interno manual minimo implementado como funcao interna em `shared/db`, sem caller real e sem uso de unidade real;
- a funcao implementada permanece interna, nao cria entrypoint, nao cria rota, nao cria CLI, nao cria script, nao cria job, nao cria bootstrap e nao toca request path;
- a implementacao valida contexto manual explicito, exige `source=manual`, `approved=true`, `reason` nao vazia e `actor` nao vazio, e recusa caller automatico, oportunista, request path, rota, CLI, script, job e bootstrap;
- a implementacao usa apenas funcoes publicas do writer para `pending -> ready -> active`, nao escreve registry diretamente, nao chama `resolveConnection`, nao decide tenant routing e nao abre tenant connection;
- `resolveConnection` continua sendo o unico decisor de tenant routing e o writer continua sendo a unica camada de escrita usada pelo owner;
- a ativacao real continua fechada e este checkpoint nao altera a regra de acumulacao local dos microcortes da Fase F ate fechamento global ou autorizacao explicita.

## 17. Fechamento parcial seguro da Fase F

- a Fase F atinge neste ponto um fechamento parcial seguro como bloco local, com rollback operacional, piloto controlado sintetico, contrato do owner manual e owner interno manual minimo ja cobertos por contrato, implementacao minima e documentacao;
- o owner permanece sem caller real, sem entrypoint operacional e sem qualquer rota, CLI, script, job, bootstrap ou request path;
- `resolveConnection` permanece como unico decisor de tenant routing; o writer permanece como unica camada de escrita usada pelo owner; fallback e rollback para `baseConnection` permanecem cobertos por teste;
- nao houve ativacao real, nao houve unidade real e nao houve abertura operacional do corredor multi-db por unidade;
- o proximo bloco futuro, se houver continuidade, deixa de ser ampliar contrato basico e passa a ser decidir explicitamente entre manter pausa da fase ou abrir um entrypoint manual deliberado em rodada propria;
- os commits desta frente continuam locais, sem push, ate autorizacao explicita ou fechamento global da fase.

## 18. Encerramento global da Fase F

- a Fase F fica encerrada globalmente neste ponto como bloco local validado, sem reabrir codigo, testes ou superficie operacional;
- o encerramento consolida como cobertos: rollback operacional caracterizado, piloto controlado sintetico caracterizado, contrato documental do owner manual, contrato testado do owner e owner interno manual minimo implementado e documentado;
- o owner continua sem caller real; nao existe entrypoint operacional, rota, CLI, script, job, bootstrap ou request path; nao houve ativacao real, nao houve unidade real e nao houve dados reais;
- `resolveConnection` continua como unico decisor de tenant routing; o writer continua como unica camada de escrita usada pelo owner; fallback e rollback para `baseConnection` permanecem preservados e cobertos;
- a baseline final completa deste encerramento ficou registrada em estado verde: `git status -sb` em `migration/refactor-core...origin/migration/refactor-core [ahead 10]`, `npm run verify:imports` verde com `Arquitetura limpa` e `npm test` verde com 2195 tests, 17 suites, 2193 pass, 0 fail, 2 skipped e `duration_ms=254435.6371`;
- este encerramento global nao publica a frente: o push continua proibido neste microcorte e so pode acontecer apos o commit documental final desta secao;
- qualquer continuidade futura deixa de ser extensao automatica da Fase F e passa a exigir nova fase ou novo bloco explicito, apenas para decidir entre manter a pausa sem entrypoint, abrir um entrypoint manual deliberado em rodada propria ou planejar piloto nao produtivo com unidade sintetica/controlada.
