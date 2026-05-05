# Fase N - Contrato de Execucao Manual Controlada Nao Produtiva e Sintetica

## 1. Status

- Aberta.

## 2. Natureza da fase

Registrar que a Fase N e:

- documental;
- contratual;
- nao produtiva;
- sintetica;
- preparatoria de decisao;
- nao operacional.

Registrar expressamente:

- A Fase N nao executa piloto real.
- A Fase N nao cria caller real.
- A Fase N nao cria rota, CLI, script, job, bootstrap ou request path.
- A Fase N nao altera registry real.
- A Fase N nao altera allowlist real.
- A Fase N nao abre tenant DB real.
- A Fase N nao muda roteamento.
- A Fase N nao envolve Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

## 3. Origem

Registrar que a Fase N deriva do encerramento documental da Fase M, publicado em:

f40ad35 docs(tenant): registra encerramento da fase m no status

Registrar que a Fase M concluiu apenas o contrato documental de preparacao e recomendou discutir fase posterior explicita de contrato de execucao manual controlada, nao produtiva e sintetica.

Registrar que a Fase N so existe porque foi aberta explicitamente neste microcorte.

## 4. Candidato sintetico herdado

Registrar o candidato herdado das Fases J, K, L e M:

- targetId: fase-j-synthetic-unit-candidate-001
- unidadeId: 0000000000000000000000a1
- dbName: wdgestor_unit_0000000000000000000000a1
- databaseKey: wdgestor_unit_0000000000000000000000a1
- plannedAllowlist: [0000000000000000000000a1]
- targetKind: syntheticUnit
- environment: non-production
- dataClass: discardable
- trafficClass: none
- userClass: none
- portalExposure: none
- dedicatedDatabase: true

Registrar:

- O candidato permanece sintetico.
- O candidato permanece nao produtivo.
- O candidato permanece sem dados reais.
- O candidato permanece sem trafego real.
- O candidato permanece sem usuario real.
- O candidato permanece sem unidade real.
- O candidato nao deve ser copiado para src, scripts, package.json ou qualquer superficie operacional nesta fase.

## 5. Objetivo da Fase N

Definir o contrato documental para uma eventual execucao manual controlada, nao produtiva e sintetica, incluindo:

- escopo maximo permitido;
- gates de autorizacao;
- pre-condicoes;
- rollback obrigatorio;
- evidencias esperadas;
- criterios de bloqueio;
- limites semanticos;
- condicoes para eventual fase posterior.

Registrar que definir o contrato de execucao nao significa executar.

## 6. Nao objetivos

Registrar que nao sao objetivos da Fase N:

- executar piloto real;
- executar preparacao operacional concreta;
- criar comando;
- criar script;
- criar caller real;
- criar rota;
- criar CLI;
- criar job;
- criar bootstrap;
- plugar em request path;
- alterar registry real;
- alterar allowlist real;
- abrir tenant DB real;
- mudar roteamento;
- coletar evidencia operacional real;
- usar Portal;
- usar dados reais;
- usar trafego real;
- usar usuario real;
- usar unidade real;
- incluir PostgreSQL no escopo.

## 7. Principios da execucao manual controlada

Registrar os principios que deverao reger qualquer execucao futura:

- execucao futura deve ser explicita;
- execucao futura deve ser manual;
- execucao futura deve ser nao produtiva;
- execucao futura deve ser sintetica;
- execucao futura deve ter rollback definido antes;
- execucao futura deve ter gates verdes antes;
- execucao futura deve ter evidencias esperadas definidas antes;
- execucao futura deve ter autorizacao propria;
- qualquer ambiguidade degrada para nao executar;
- qualquer falha de gate degrada para nao executar;
- fallback para baseConnection e obrigatorio;
- nenhuma execucao futura pode envolver Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

## 8. Gates iniciais da Fase N

Criar gates iniciais conservadores:

- executionContractReady: false
- executionScopeDefined: false
- authorizationGatesDefined: false
- rollbackDefined: false
- evidencePlanDefined: false
- candidateStillSynthetic: true
- nonOperationalPreserved: true
- noOperationalSurfaceCreated: true
- fallbackRequired: true
- executionStillForbidden: true
- blockedReasons: []

Explicar:

- executionContractReady=false porque a Fase N acabou de ser aberta.
- executionScopeDefined=false porque o escopo de execucao ainda sera definido em microcorte posterior.
- authorizationGatesDefined=false porque os gates de autorizacao ainda serao definidos.
- rollbackDefined=false porque o rollback especifico da execucao ainda sera definido.
- evidencePlanDefined=false porque o plano de evidencias ainda sera definido.
- executionStillForbidden=true porque a Fase N nao autoriza execucao neste momento.
- blockedReasons=[] porque nao ha bloqueio documental inicial, apenas ausencia de contrato completo.

## 9. Interpretacao obrigatoria

Registrar:

- Abrir a Fase N nao autoriza execucao.
- Abrir a Fase N nao autoriza preparacao operacional concreta.
- Abrir a Fase N nao autoriza criar comando.
- Abrir a Fase N nao autoriza criar script.
- Abrir a Fase N nao autoriza criar caller real.
- Abrir a Fase N nao autoriza criar rota, CLI, job, bootstrap ou request path.
- Abrir a Fase N nao autoriza alterar registry real.
- Abrir a Fase N nao autoriza alterar allowlist real.
- Abrir a Fase N nao autoriza abrir tenant DB real.
- Abrir a Fase N nao autoriza mudar roteamento.
- Abrir a Fase N nao autoriza coletar evidencia operacional real.
- Abrir a Fase N nao autoriza envolver Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.
