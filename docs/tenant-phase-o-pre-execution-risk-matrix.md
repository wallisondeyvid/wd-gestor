# Fase O - Matriz de Riscos Pre-Execucao Manual Controlada Sintetica

## 1. Status

- Aberta.

## 2. Natureza da fase

Registrar que a Fase O e:

- documental;
- preventiva;
- nao produtiva;
- sintetica;
- nao operacional;
- posterior ao encerramento documental da Fase N;
- anterior a qualquer eventual fase de autorizacao preparatoria de execucao manual controlada.

Registrar expressamente:

- A Fase O nao executa nada.
- A Fase O nao autoriza execucao.
- A Fase O nao autoriza preparacao operacional concreta.
- A Fase O nao autoriza coleta de evidencia operacional real.
- A Fase O nao autoriza rollback real.
- A Fase O nao cria comando, script, caller real, rota, CLI, job, bootstrap ou request path.
- A Fase O nao altera registry real.
- A Fase O nao altera allowlist real.
- A Fase O nao abre tenant DB real.
- A Fase O nao muda roteamento.
- A Fase O nao envolve Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

## 3. Origem

Registrar que a Fase O nasce apos:

- Fase N encerrada documentalmente;
- status global atualizado;
- push realizado;
- auditoria pos-Fase N aprovada;
- nenhuma superficie operacional indevida encontrada.

Registrar que a Fase N produziu apenas um contrato documental de execucao manual controlada, nao produtiva e sintetica, mas nao autorizou execucao.

## 4. Objetivo

Registrar que o objetivo da Fase O e definir uma matriz documental de riscos antes de qualquer discussao de autorizacao preparatoria.

A matriz devera futuramente mapear, no minimo:

- riscos de confundir documento com autorizacao;
- riscos de transformar candidato sintetico em execucao real;
- riscos de criacao acidental de caller real;
- riscos de criacao acidental de rota, CLI, script, job, bootstrap ou request path;
- riscos de alteracao indevida de registry real;
- riscos de alteracao indevida de allowlist real;
- riscos de abertura indevida de tenant DB real;
- riscos de mudanca indevida de roteamento;
- riscos de perda de fallback para `baseConnection`;
- riscos de envolver Portal;
- riscos de envolver dados reais;
- riscos de envolver trafego real;
- riscos de envolver usuario real;
- riscos de envolver unidade real;
- riscos de envolver PostgreSQL;
- riscos de execucao sem rollback proprio;
- riscos de execucao sem gates proprios;
- riscos de execucao sem evidencias proprias;
- riscos de push sem validacao completa.

## 5. Relacao com a Fase N

Registrar que:

- A Fase N esta encerrada.
- A Fase N nao abre a Fase O automaticamente.
- A Fase O esta sendo aberta explicitamente como fase documental propria.
- A Fase O nao herda autorizacao operacional da Fase N.
- A Fase O pode usar a Fase N como insumo documental, mas nao como autorizacao.
- `executionContractReady=true` da Fase N nao autoriza execucao na Fase O.
- `executionStillForbidden=true` permanece como principio de seguranca.

## 6. Gates iniciais

Criar gates iniciais conservadores:

- riskMatrixOpened=true
- riskMatrixDefined=false
- riskCategoriesDefined=false
- riskSeverityDefined=false
- mitigationPlanDefined=false
- authorizationStillForbidden=true
- executionStillForbidden=true
- operationalSurfaceStillForbidden=true
- candidateStillSynthetic=true
- nonOperationalPreserved=true
- fallbackRequired=true
- blockedReasons=[]

Explicar:

- riskMatrixOpened=true porque a Fase O foi aberta documentalmente.
- riskMatrixDefined=false porque a matriz de riscos ainda nao foi definida.
- riskCategoriesDefined=false porque as categorias de risco ainda nao foram detalhadas.
- riskSeverityDefined=false porque severidade/probabilidade ainda nao foram definidas.
- mitigationPlanDefined=false porque o plano de mitigacao ainda nao foi definido.
- authorizationStillForbidden=true porque a Fase O nao autoriza execucao nem preparacao operacional concreta.
- executionStillForbidden=true porque nenhuma execucao e permitida nesta fase.
- operationalSurfaceStillForbidden=true porque nenhuma superficie operacional pode ser criada.
- candidateStillSynthetic=true porque o unico candidato permanece sintetico.
- nonOperationalPreserved=true porque a fase permanece documental.
- fallbackRequired=true porque fallback para `baseConnection` permanece obrigatorio.
- blockedReasons=[] porque nao ha bloqueio documental inicial; ha apenas ausencia da matriz completa.

## 7. Superficies proibidas

Registrar que permanecem proibidos nesta fase:

- execucao real;
- preparacao operacional concreta;
- coleta de evidencia operacional real;
- rollback real;
- caller real;
- rota;
- CLI;
- script;
- job;
- bootstrap;
- request path;
- alteracao de registry real;
- alteracao de allowlist real;
- abertura de tenant DB real;
- mudanca de roteamento;
- Portal;
- dados reais;
- trafego real;
- usuario real;
- unidade real;
- PostgreSQL;
- qualquer alteracao funcional oportunista.

## 8. Criterio de avanco da Fase O

Registrar que a Fase O so podera avancar quando a matriz documental de riscos estiver completa, incluindo:

- categorias de risco;
- severidade;
- probabilidade;
- gatilhos de bloqueio;
- mitigacao;
- evidencia esperada;
- regra de rollback ou interrupcao;
- interpretacao obrigatoria de que mitigacao nao e autorizacao.

Registrar que mesmo uma matriz completa nao autoriza execucao.

## 9. Interpretacao obrigatoria

Registrar:

- Abrir a Fase O nao autoriza execucao.
- Abrir a Fase O nao autoriza preparacao operacional concreta.
- Abrir a Fase O nao autoriza coleta de evidencia operacional real.
- Abrir a Fase O nao autoriza rollback real.
- Abrir a Fase O nao autoriza criar comando.
- Abrir a Fase O nao autoriza criar script.
- Abrir a Fase O nao autoriza criar caller real.
- Abrir a Fase O nao autoriza criar rota, CLI, job, bootstrap ou request path.
- Abrir a Fase O nao autoriza alterar registry real.
- Abrir a Fase O nao autoriza alterar allowlist real.
- Abrir a Fase O nao autoriza abrir tenant DB real.
- Abrir a Fase O nao autoriza mudar roteamento.
- Abrir a Fase O nao autoriza envolver Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.
- Abrir a Fase O nao abre fase posterior automaticamente.
