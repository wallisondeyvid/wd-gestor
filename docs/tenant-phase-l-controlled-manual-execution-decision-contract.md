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

## 9. Estados possiveis ao final da Fase L

- Apto para preparar execucao manual controlada em fase posterior:
  significa apenas que uma proxima fase podera preparar, ainda sob contrato explicito, uma execucao manual controlada nao produtiva; nao significa execucao automatica.
- Apto apenas para nova fase documental:
  significa que ainda ha lacunas contratuais e que a proxima fase deve continuar documental.
- Bloqueado:
  significa que algum risco, ambiguidade ou inconsistenca impede qualquer avanco; nesse caso, permanecer no estado pos-Fase K sem operacao.

## 10. Gates da Fase L

- `decisionContractReady`
- `candidateStillSynthetic`
- `manualOnlyPreserved`
- `nonOperationalPreserved`
- `fallbackPreserved`
- `rollbackPreconditionsPreserved`
- `noOperationalSurfaceCreated`
- `baselineGreen`
- `blockedReasons`

## 11. Resultado inicial

- `decisionContractReady`: `false`
- `candidateStillSynthetic`: `true`
- `manualOnlyPreserved`: `true`
- `nonOperationalPreserved`: `true`
- `fallbackPreserved`: `true`
- `rollbackPreconditionsPreserved`: `true`
- `noOperationalSurfaceCreated`: `true`
- `baselineGreen`: `true`
- `blockedReasons`: `[]`

## 12. Interpretacao obrigatoria

- Enquanto a Fase L estiver aberta, nenhuma execucao esta autorizada.
- Enquanto a Fase L estiver aberta, nenhuma preparacao operacional esta autorizada.
- Enquanto a Fase L estiver aberta, nenhum caller real esta autorizado.
- Enquanto a Fase L estiver aberta, nenhuma alteracao em codigo operacional esta autorizada.
- Enquanto a Fase L estiver aberta, nenhuma alteracao em registry real esta autorizada.
- Enquanto a Fase L estiver aberta, nenhuma alteracao em allowlist real esta autorizada.

- A Fase L e uma trava de decisao, nao um inicio de operacao.
