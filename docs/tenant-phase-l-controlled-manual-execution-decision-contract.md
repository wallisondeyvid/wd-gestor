# Fase L - Contrato de Decisao para Execucao Manual Controlada Nao Produtiva do Candidato Sintetico Multi-DB

## 1. Status

- Encerrada.

## 2. Natureza da fase

- Documental e decisoria.
- A Fase L nao executa piloto real, nao ativa unidade real, nao altera registry real, nao altera allowlist real, nao abre tenant DB real, nao muda roteamento e nao cria superficie operacional nova.

## 3. Origem

- Fase K encerrada e publicada.
- Candidato sintetico multi-DB documentalmente preparado.
- Plano de validacao controlada nao operacional definido.
- Gates preservados.
- Fallback obrigatorio para baseConnection.
- Nenhuma execucao real autorizada.

## 4. Candidato documental herdado

- `targetId`: `fase-j-synthetic-unit-candidate-001`
- `unidadeId`: `0000000000000000000000a1`
- `dbName`: `wdgestor_unit_0000000000000000000000a1`
- `databaseKey`: `wdgestor_unit_0000000000000000000000a1`
- `plannedAllowlist`: `[0000000000000000000000a1]`
- `targetKind`: `syntheticUnit`
- `environment`: `non-production`
- `dataClass`: `discardable`
- `trafficClass`: `none`
- `userClass`: `none`
- `portalExposure`: `none`
- `dedicatedDatabase`: `true`

## 5. Objetivo

- Definir o contrato de decisao que determinara se uma fase posterior podera preparar uma execucao manual controlada, nao produtiva e sintetica do candidato multi-DB.
- A Fase L nao autoriza execucao por si so.

## 6. Nao objetivos

- A Fase L nao deve executar piloto real.
- A Fase L nao deve ativar unidade real.
- A Fase L nao deve alterar registry real.
- A Fase L nao deve alterar allowlist real.
- A Fase L nao deve abrir tenant DB real.
- A Fase L nao deve mudar roteamento.
- A Fase L nao deve criar caller real.
- A Fase L nao deve criar rota.
- A Fase L nao deve criar CLI.
- A Fase L nao deve criar script operacional.
- A Fase L nao deve criar job.
- A Fase L nao deve criar bootstrap.
- A Fase L nao deve plugar qualquer fluxo em request path.
- A Fase L nao deve envolver Portal.
- A Fase L nao deve envolver dados reais.
- A Fase L nao deve envolver trafego real.
- A Fase L nao deve envolver usuario real.
- A Fase L nao deve envolver unidade real.
- A Fase L nao deve envolver PostgreSQL.

## 7. Principios de decisao

- `eligible=true` nao e autorizacao operacional.
- Selecao documental nao e operacao.
- `evidenceReady=true` nao significa evidencia real coletada.
- `validationPlanReady=true` nao significa execucao autorizada.
- `gatesPreserved=true` e contrato documental.
- `nonOperational=true` continua verdadeiro durante esta fase.
- Qualquer ambiguidade degrada para nao executar.
- Qualquer falha de gate deve cair para `baseConnection`.
- Fallback para `baseConnection` e obrigatorio.
- Rollback precisa estar definido antes de qualquer avanco operacional.
- Allowlist deve permanecer unitaria, explicita e sintetica.
- Nenhum caller real deve ser criado por oportunidade.

## 8. Criterios minimos para considerar fase posterior de preparacao

- candidato sintetico continua unico e explicito;
- ambiente continua nao produtivo;
- dados continuam descartaveis;
- trafego continua ausente;
- usuario real continua ausente;
- Portal continua fora de escopo;
- PostgreSQL continua fora de escopo;
- fallback para `baseConnection` continua preservado;
- rollback continua definido antes de qualquer execucao;
- owner manual continua sem caller real;
- entrypoint manual continua sem caller real;
- harness de teste continua nao sendo tratado como piloto real;
- nenhuma rota, CLI, script, job, bootstrap ou request path e criado;
- baseline arquitetural permanece verde.

## 9. Criterios formais de decisao da Fase L

Criterios para encerrar como "apto para preparar execucao manual controlada em fase posterior":

- candidato sintetico continua unico, explicito e identico ao herdado da Fase J/K;
- ambiente continua nao produtivo;
- dados continuam descartaveis;
- trafego continua ausente;
- usuario real continua ausente;
- Portal continua fora de escopo;
- PostgreSQL continua fora de escopo;
- owner manual continua sem caller real;
- entrypoint manual continua sem caller real;
- nao existe rota, CLI, script operacional, job, bootstrap ou request path novo;
- fallback para `baseConnection` continua obrigatorio;
- rollback permanece definido antes de qualquer avanco operacional;
- allowlist permanece unitaria, explicita e sintetica;
- baseline arquitetural permanece verde;
- nenhuma ambiguidade relevante permanece aberta.

Criterios para encerrar como "apto apenas para nova fase documental":

- ha lacunas de decisao que ainda podem ser resolvidas documentalmente;
- nao ha evidencia de alteracao operacional indevida;
- nao ha caller real;
- nao ha ativacao real;
- nao ha alteracao de registry real;
- nao ha alteracao de allowlist real;
- nao ha abertura de tenant DB real;
- nao ha mudanca de roteamento;
- os riscos encontrados nao exigem rollback, apenas nova documentacao ou nova matriz decisoria.

Criterios para encerrar como "bloqueado":

- qualquer caller real foi criado;
- qualquer rota, CLI, script operacional, job, bootstrap ou request path foi criado;
- qualquer alteracao operacional foi feita sem fase explicita;
- qualquer registry real foi alterado;
- qualquer allowlist real foi alterada;
- qualquer tenant DB real foi aberto;
- qualquer unidade real, usuario real, trafego real, dado real ou Portal foi envolvido;
- PostgreSQL entrou no escopo;
- fallback para `baseConnection` foi enfraquecido;
- rollback deixou de estar definido;
- baseline arquitetural ficou vermelha;
- ha ambiguidade operacional que nao degrada claramente para nao executar.

Evidencias documentais minimas:

- referencia ao documento canonico da Fase K;
- referencia ao documento canonico da Fase L;
- referencia ao candidato sintetico herdado;
- confirmacao de ausencia de caller real;
- confirmacao de ausencia de superficie operacional nova;
- confirmacao de fallback preservado;
- confirmacao de rollback preservado;
- confirmacao de baseline verde;
- lista explicita de `blockedReasons`, ainda que vazia.

Interpretacao obrigatoria dos criterios:

- nenhum criterio da Fase L autoriza execucao dentro da propria Fase L;
- encerrar como apto para preparar execucao manual controlada significa apenas autorizar discussao ou preparacao em fase posterior explicita;
- a Fase L nao cria autorizacao retroativa para owner, entrypoint, writer, registry ou `resolveConnection` serem chamados por fluxo real;
- na duvida, o resultado deve ser "apto apenas para nova fase documental" ou "bloqueado", nunca execucao.

Observacao de gate:

- os criterios formais de decisao foram definidos neste microcorte, mas o gate final `decisionContractReady` permanece `false` ate checklist ou consolidacao posterior.

## 10. Evidencias documentais aceitas na Fase L

Evidencia documental dos contratos herdados:

- Documento canonico da Fase H: `docs/tenant-phase-h-operational-envelope-contract.md`.
- Documento canonico da Fase I: `docs/tenant-phase-i-target-eligibility-matrix-contract.md`.
- Documento canonico da Fase J: `docs/tenant-phase-j-synthetic-candidate-proposal-plan.md`.
- Documento canonico da Fase K: `docs/tenant-phase-k-non-operational-controlled-validation-plan.md`.
- Documento canonico da Fase L: `docs/tenant-phase-l-controlled-manual-execution-decision-contract.md`.

Evidencia do candidato sintetico herdado:

- `targetId` continua `fase-j-synthetic-unit-candidate-001`;
- `unidadeId` continua `0000000000000000000000a1`;
- `dbName` continua `wdgestor_unit_0000000000000000000000a1`;
- `databaseKey` continua `wdgestor_unit_0000000000000000000000a1`;
- `plannedAllowlist` continua [`0000000000000000000000a1`];
- `targetKind` continua `syntheticUnit`;
- `environment` continua `non-production`;
- `dataClass` continua `discardable`;
- `trafficClass` continua `none`;
- `userClass` continua `none`;
- `portalExposure` continua `none`;
- `dedicatedDatabase` continua `true`.

Evidencia de ausencia de caller real:

- nenhuma chamada real ao owner manual fora do proprio modulo e dos testes;
- nenhuma chamada real ao entrypoint manual fora do proprio modulo e dos testes;
- nenhum caller criado em rota;
- nenhum caller criado em CLI;
- nenhum caller criado em script operacional;
- nenhum caller criado em job;
- nenhum caller criado em bootstrap;
- nenhum caller plugado em request path.

Evidencia de ausencia de superficie operacional:

- nenhuma rota nova;
- nenhuma CLI nova;
- nenhum script operacional novo;
- nenhum job novo;
- nenhum bootstrap novo;
- nenhuma integracao com Portal;
- nenhuma alteracao em `package.json` que autorize operacao;
- nenhum reaproveitamento de harness de teste como piloto real.

Evidencia de fallback preservado:

- qualquer falha de gate continua degradando para `baseConnection`;
- ausencia de registry valido continua degradando para `baseConnection`;
- unidade fora da allowlist continua degradando para `baseConnection`;
- entry inconsistente, `disabled`, `rollback_required`, `pending` ou `provisioning` continua degradando para `baseConnection`;
- `routingMode` diferente de `tenant` continua degradando para `baseConnection`;
- `activation.active` ausente ou falso continua degradando para `baseConnection`.

Evidencia de rollback preservado:

- rollback continua definido antes de qualquer avanco operacional;
- `rollback_required` continua bloqueante;
- `disabled` continua bloqueante;
- perda de allowlist continua bloqueante;
- perda de `activation.active` continua bloqueante;
- retorno de `routingMode` para `base` continua bloqueante.

Evidencia de allowlist unitaria e sintetica:

- `plannedAllowlist` continua unitaria;
- `plannedAllowlist` contem apenas `0000000000000000000000a1`;
- nao ha allowlist real alterada;
- nao ha unidade real adicionada;
- nao ha usuario real envolvido.

Evidencia de baseline verde:

- `verify:imports` deve permanecer verde;
- testes arquiteturais de owner manual devem permanecer verdes;
- testes arquiteturais de entrypoint manual devem permanecer verdes;
- testes arquiteturais de piloto nao produtivo devem permanecer verdes;
- testes arquiteturais de piloto controlado devem permanecer verdes;
- testes writer -> `resolveConnection` devem permanecer verdes;
- antes de qualquer fechamento global da Fase L, `npm test` completo deve ser recomendado.

Evidencia de `blockedReasons`:

- `blockedReasons` deve existir explicitamente;
- `blockedReasons` pode permanecer vazio apenas se todos os gates documentais estiverem preservados;
- qualquer ambiguidade operacional deve preencher `blockedReasons`;
- qualquer violacao de superficie operacional deve preencher `blockedReasons` e bloquear a fase;
- `blockedReasons` vazio nao autoriza execucao.

Interpretacao obrigatoria das evidencias:

- evidencia documental nao e evidencia operacional real;
- evidencia de ausencia nao autoriza criacao de caller;
- baseline verde nao autoriza execucao;
- fallback preservado nao autoriza abertura de tenant DB real;
- allowlist planejada nao e allowlist real alterada;
- nenhuma evidencia da Fase L autoriza piloto dentro da propria Fase L.

Observacao de gate das evidencias:

- as evidencias aceitas foram definidas neste microcorte, mas o gate final `decisionContractReady` continua dependente de checklist ou consolidacao posterior.

## 11. Estados possiveis ao final da Fase L

- Apto para preparar execucao manual controlada em fase posterior:
  significa apenas que uma proxima fase podera preparar, ainda sob contrato explicito, uma execucao manual controlada nao produtiva; nao significa execucao automatica.
- Apto apenas para nova fase documental:
  significa que ainda ha lacunas contratuais e que a proxima fase deve continuar documental.
- Bloqueado:
  significa que algum risco, ambiguidade ou inconsistenca impede qualquer avanco; nesse caso, permanecer no estado pos-Fase K sem operacao.

## 12. Gates da Fase L

Os gates da Fase L sao gates documentais e decisorios. Eles nao autorizam execucao dentro da propria Fase L.

Gate `decisionContractReady`:

- deve permanecer `false` enquanto a fase ainda nao tiver checklist ou consolidacao final;
- so podera ser considerado `true` se os criterios formais de decisao estiverem definidos;
- so podera ser considerado `true` se as evidencias documentais aceitas estiverem definidas;
- so podera ser considerado `true` se os gates estiverem detalhados;
- so podera ser considerado `true` se os `blockedReasons` tiverem sido avaliados;
- so podera ser considerado `true` se a baseline recomendada estiver verde;
- so podera ser considerado `true` se nao houver violacao operacional;
- mesmo quando `true`, nao autoriza execucao dentro da Fase L.

Gate `candidateStillSynthetic`:

- exige que o candidato continue exatamente o herdado da Fase J/K;
- `targetId` deve permanecer `fase-j-synthetic-unit-candidate-001`;
- `unidadeId` deve permanecer `0000000000000000000000a1`;
- `dbName` deve permanecer `wdgestor_unit_0000000000000000000000a1`;
- `databaseKey` deve permanecer `wdgestor_unit_0000000000000000000000a1`;
- `plannedAllowlist` deve permanecer [`0000000000000000000000a1`];
- `environment` deve permanecer `non-production`;
- `dataClass` deve permanecer `discardable`;
- `trafficClass` deve permanecer `none`;
- `userClass` deve permanecer `none`;
- `portalExposure` deve permanecer `none`;
- qualquer troca de candidato, inclusao de unidade real ou ampliacao de allowlist bloqueia a fase.

Gate `manualOnlyPreserved`:

- exige que owner manual e entrypoint manual continuem sem caller real;
- proibe caller em rota, CLI, script operacional, job, bootstrap, request path ou Portal;
- harness de teste nao pode ser reclassificado como piloto real.

Gate `nonOperationalPreserved`:

- exige que a Fase L continue documental, decisoria e nao operacional;
- proibe execucao real, preparacao operacional, ativacao real, alteracao de registry real, alteracao de allowlist real, abertura de tenant DB real e mudanca de roteamento;
- baseline verde nao muda essa interpretacao.

Gate `fallbackPreserved`:

- exige que qualquer falha de gate continue caindo para `baseConnection`;
- exige que entrada ausente, invalida, `disabled`, `rollback_required`, `pending`, `provisioning`, fora da allowlist, sem `activation.active` ou com `routingMode` diferente de `tenant` continue sem abrir tenant connection.

Gate `rollbackPreconditionsPreserved`:

- exige que rollback permaneça definido antes de qualquer avanco operacional posterior;
- exige que `disabled`, `rollback_required`, perda de allowlist, perda de `activation.active` e retorno de `routingMode` para `base` continuem bloqueantes.

Gate `noOperationalSurfaceCreated`:

- exige ausencia de rota nova;
- exige ausencia de CLI nova;
- exige ausencia de script operacional novo;
- exige ausencia de job novo;
- exige ausencia de bootstrap novo;
- exige ausencia de request path novo;
- exige ausencia de integracao com Portal;
- exige ausencia de alteracao em `package.json` que autorize operacao;
- exige ausencia de caller real para owner, entrypoint, writer, registry ou `resolveConnection`.

Gate `baselineGreen`:

- exige baseline curta verde durante microcortes documentais;
- `verify:imports` deve permanecer verde;
- testes arquiteturais do owner manual devem permanecer verdes;
- testes arquiteturais do entrypoint manual devem permanecer verdes;
- testes arquiteturais do piloto nao produtivo devem permanecer verdes;
- testes arquiteturais do piloto controlado devem permanecer verdes;
- testes writer -> `resolveConnection` devem permanecer verdes;
- antes do fechamento global da Fase L, `npm test` completo deve ser recomendado;
- baseline verde nao autoriza execucao.

Gate `blockedReasons`:

- deve existir explicitamente;
- pode permanecer vazio apenas se todos os gates documentais estiverem preservados;
- deve ser preenchido em caso de ambiguidade operacional;
- deve ser preenchido em caso de qualquer superficie operacional criada;
- deve ser preenchido em caso de qualquer alteracao real em registry ou allowlist;
- deve ser preenchido em caso de qualquer abertura de tenant DB real;
- deve ser preenchido em caso de qualquer envolvimento de unidade real, usuario real, trafego real, dado real ou Portal;
- deve ser preenchido em caso de baseline vermelha;
- deve ser preenchido em caso de fallback ou rollback enfraquecido;
- deve ser preenchido em caso de PostgreSQL entrando no escopo;
- `blockedReasons` vazio nao autoriza execucao.

Interpretacao obrigatoria dos gates:

- gates verdes na Fase L autorizam apenas encerramento documental da propria Fase L;
- gates verdes nao autorizam execucao manual dentro da Fase L;
- gates verdes nao autorizam caller real;
- gates verdes nao autorizam rota, CLI, script, job, bootstrap ou request path;
- qualquer duvida degrada para "nao executar" ou "bloqueado".

## 13. Resultado do checklist documental

- `decisionContractReady`: `true`
- `candidateStillSynthetic`: `true`
- `manualOnlyPreserved`: `true`
- `nonOperationalPreserved`: `true`
- `fallbackPreserved`: `true`
- `rollbackPreconditionsPreserved`: `true`
- `noOperationalSurfaceCreated`: `true`
- `baselineGreen`: `true`
- `blockedReasons`: `[]`

Interpretacao de `decisionContractReady=true`:

- significa apenas que o contrato documental de decisao da Fase L esta pronto;
- nao autoriza execucao dentro da Fase L;
- nao autoriza preparacao operacional;
- nao autoriza caller real;
- nao autoriza rota, CLI, script, job, bootstrap ou request path;
- nao autoriza alteracao de registry real;
- nao autoriza alteracao de allowlist real;
- nao autoriza abertura de tenant DB real;
- nao autoriza mudanca de roteamento;
- nao envolve Portal;
- nao envolve dados reais;
- nao envolve trafego real;
- nao envolve usuario real;
- nao envolve unidade real;
- nao envolve PostgreSQL.

Checklist documental aplicado:

- criterios formais de decisao foram definidos;
- evidencias documentais aceitas foram definidas;
- semantica dos gates foi definida;
- candidato sintetico herdado permanece o mesmo;
- owner manual permanece sem caller real;
- entrypoint manual permanece sem caller real;
- fallback para `baseConnection` permanece obrigatorio;
- rollback permanece pre-condicao;
- allowlist permanece unitaria, explicita e sintetica;
- ausencia de superficie operacional nova permanece preservada;
- baseline curta permanece verde;
- `blockedReasons` permanece vazio porque nenhum bloqueador documental foi identificado.

Estado documental apos checklist:

- A Fase L fica documentalmente apta a ser encerrada em microcorte posterior.
- Esse estado nao e encerramento global automatico.
- Esse estado nao e autorizacao para execucao.
- O proximo microcorte devera ser o encerramento documental da Fase L ou uma atualizacao de status, conforme decisao posterior.
- Antes de fechamento global ou publicacao da Fase L, recomendar `npm test` completo.

Resultado decisorio provisorio:

- Resultado provisorio: apto para preparar discussao de fase posterior explicita.
- Interpretacao obrigatoria: "apto para preparar discussao" nao significa executar, preparar operacao ou criar caller real.
- Qualquer fase posterior que trate execucao manual controlada devera ser aberta explicitamente, com novo contrato, novos gates, rollback e autorizacao propria.

## 14. Interpretacao obrigatoria

- Mesmo com a Fase L encerrada documentalmente, nenhuma execucao esta autorizada.
- Mesmo com a Fase L encerrada documentalmente, nenhuma preparacao operacional esta autorizada.
- Mesmo com a Fase L encerrada documentalmente, nenhum caller real esta autorizado.
- Mesmo com a Fase L encerrada documentalmente, nenhuma alteracao em codigo operacional esta autorizada.
- Mesmo com a Fase L encerrada documentalmente, nenhuma alteracao em registry real esta autorizada.
- Mesmo com a Fase L encerrada documentalmente, nenhuma alteracao em allowlist real esta autorizada.

- A Fase L e uma trava de decisao, nao um inicio de operacao.

## 15. Encerramento documental da Fase L

- Status final: Encerrada.
- Tipo de encerramento: documental, decisorio e nao operacional.
- Resultado final: apto para preparar discussao de fase posterior explicita.

Interpretacao obrigatoria do resultado:

- "apto para preparar discussao de fase posterior explicita" nao significa executar;
- nao significa preparar operacao;
- nao significa criar caller real;
- nao significa criar rota, CLI, script, job, bootstrap ou request path;
- nao significa alterar registry real;
- nao significa alterar allowlist real;
- nao significa abrir tenant DB real;
- nao significa mudar roteamento;
- nao envolve Portal;
- nao envolve dados reais;
- nao envolve trafego real;
- nao envolve usuario real;
- nao envolve unidade real;
- nao envolve PostgreSQL.

Gates finais:

- `decisionContractReady`: `true`
- `candidateStillSynthetic`: `true`
- `manualOnlyPreserved`: `true`
- `nonOperationalPreserved`: `true`
- `fallbackPreserved`: `true`
- `rollbackPreconditionsPreserved`: `true`
- `noOperationalSurfaceCreated`: `true`
- `baselineGreen`: `true`
- `blockedReasons`: `[]`

Evidencias consolidadas:

- criterios formais de decisao definidos;
- evidencias documentais aceitas definidas;
- gates detalhados;
- checklist documental aplicado;
- candidato sintetico herdado preservado;
- owner manual sem caller real;
- entrypoint manual sem caller real;
- fallback para `baseConnection` preservado;
- rollback preservado como pre-condicao;
- allowlist planejada permanece unitaria, explicita e sintetica;
- nenhuma superficie operacional nova criada;
- baseline curta verde;
- `blockedReasons` vazio.

Proxima fase possivel:

- Uma fase posterior podera discutir a preparacao de execucao manual controlada, nao produtiva e sintetica.
- Essa fase posterior devera ser aberta explicitamente.
- Essa fase posterior devera ter contrato proprio, gates proprios, rollback proprio e autorizacao propria.
- A Fase L nao abre essa fase automaticamente.

Recomendacao de validacao antes de publicacao:

- Antes de atualizar o status global e considerar push, recomendar `npm test` completo.
- O push permanece proibido ate fechamento global, status consolidado e autorizacao explicita.
