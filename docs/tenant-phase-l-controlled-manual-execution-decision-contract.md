# Fase L - Contrato de Decisao para Execucao Manual Controlada Nao Produtiva do Candidato Sintetico Multi-DB

## 1. Status

- Aberta.

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

- `decisionContractReady`
- `candidateStillSynthetic`
- `manualOnlyPreserved`
- `nonOperationalPreserved`
- `fallbackPreserved`
- `rollbackPreconditionsPreserved`
- `noOperationalSurfaceCreated`
- `baselineGreen`
- `blockedReasons`

## 13. Resultado inicial

- `decisionContractReady`: `false`
- `candidateStillSynthetic`: `true`
- `manualOnlyPreserved`: `true`
- `nonOperationalPreserved`: `true`
- `fallbackPreserved`: `true`
- `rollbackPreconditionsPreserved`: `true`
- `noOperationalSurfaceCreated`: `true`
- `baselineGreen`: `true`
- `blockedReasons`: `[]`

## 14. Interpretacao obrigatoria

- Enquanto a Fase L estiver aberta, nenhuma execucao esta autorizada.
- Enquanto a Fase L estiver aberta, nenhuma preparacao operacional esta autorizada.
- Enquanto a Fase L estiver aberta, nenhum caller real esta autorizado.
- Enquanto a Fase L estiver aberta, nenhuma alteracao em codigo operacional esta autorizada.
- Enquanto a Fase L estiver aberta, nenhuma alteracao em registry real esta autorizada.
- Enquanto a Fase L estiver aberta, nenhuma alteracao em allowlist real esta autorizada.

- A Fase L e uma trava de decisao, nao um inicio de operacao.
