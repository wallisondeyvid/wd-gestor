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
- executionScopeDefined: true
- authorizationGatesDefined: true
- rollbackDefined: true
- evidencePlanDefined: false
- candidateStillSynthetic: true
- nonOperationalPreserved: true
- noOperationalSurfaceCreated: true
- fallbackRequired: true
- executionStillForbidden: true
- blockedReasons: []

Explicar:

- executionContractReady=false porque a Fase N acabou de ser aberta.
- executionScopeDefined=true porque o escopo maximo permitido foi definido documentalmente neste microcorte.
- authorizationGatesDefined=true porque os gates documentais de autorizacao foram definidos neste microcorte.
- rollbackDefined=true porque o rollback documental da execucao foi definido neste microcorte.
- evidencePlanDefined=false porque o plano de evidencias ainda sera definido.
- executionStillForbidden=true porque a Fase N nao autoriza execucao neste momento.
- blockedReasons=[] porque nao ha bloqueio documental inicial, apenas ausencia de contrato completo.

## 9. Escopo maximo permitido da execucao manual controlada

Registrar que o escopo da Fase N e apenas documental e define limites para uma eventual fase posterior.

### 9.1 Escopo permitido apenas como contrato

Registrar que a Fase N pode definir, documentalmente:

- qual candidato sintetico poderia ser usado;
- quais pre-condicoes deveriam existir;
- quais gates deveriam estar verdes;
- quais evidencias deveriam ser esperadas;
- qual rollback deveria estar definido;
- quais limites de nao producao deveriam ser preservados;
- quais criterios bloqueariam a execucao;
- quais condicoes minimas seriam necessarias antes de qualquer autorizacao futura.

Registrar expressamente que definir escopo nao significa executar.

### 9.2 Escopo maximo de uma eventual execucao futura

Registrar que, se uma fase posterior vier a autorizar execucao manual controlada, o escopo maximo admissivel devera ser limitado a:

- candidato sintetico herdado das Fases J/K/L/M/N;
- ambiente nao produtivo;
- dados descartaveis;
- ausencia de trafego real;
- ausencia de usuario real;
- ausencia de unidade real;
- ausencia de Portal;
- allowlist unitaria e explicita;
- fallback obrigatorio para baseConnection;
- rollback definido antes da execucao;
- evidencias esperadas definidas antes da execucao;
- autorizacao explicita e propria da fase posterior.

Registrar que qualquer item fora desse escopo bloqueia a execucao.

### 9.3 Fora de escopo absoluto

Registrar que continuam fora de escopo:

- execucao em producao;
- execucao com dados reais;
- execucao com trafego real;
- execucao com usuario real;
- execucao com unidade real;
- exposicao ao Portal;
- alteracao de rotas reais;
- criacao de caller real;
- criacao de CLI;
- criacao de script operacional;
- criacao de job;
- criacao de bootstrap;
- ligacao em request path;
- alteracao de registry real;
- alteracao de allowlist real;
- abertura de tenant DB real nesta fase;
- mudanca de roteamento;
- PostgreSQL;
- qualquer alteracao funcional oportunista.

### 9.4 Resultado do escopo

Registrar:

- executionScopeDefined=true;
- executionContractReady permanece false;
- authorizationGatesDefined permanece false;
- rollbackDefined permanece false;
- evidencePlanDefined permanece false;
- executionStillForbidden permanece true;
- blockedReasons permanece [].

Interpretacao obrigatoria:

- executionScopeDefined=true significa apenas que o escopo documental foi definido.
- executionScopeDefined=true nao autoriza execucao.
- executionScopeDefined=true nao autoriza preparacao operacional concreta.
- executionScopeDefined=true nao autoriza criar comando, script, caller real, rota, CLI, job, bootstrap ou request path.
- executionScopeDefined=true nao autoriza alterar registry real, allowlist real ou roteamento.
- executionScopeDefined=true nao autoriza abrir tenant DB real nesta fase.
- executionScopeDefined=true nao autoriza envolver Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

## 10. Gates de autorizacao da execucao manual controlada

Registrar que os gates da Fase N sao documentais, preventivos e nao operacionais.

### 10.1 Gates obrigatorios para qualquer execucao futura

Registrar que uma fase posterior so podera discutir execucao manual controlada se todos os gates abaixo estiverem definidos e verdes:

- candidato sintetico preservado;
- ambiente nao produtivo confirmado;
- dados descartaveis confirmados;
- ausencia de trafego real confirmada;
- ausencia de usuario real confirmada;
- ausencia de unidade real confirmada;
- ausencia de Portal confirmada;
- allowlist unitaria e explicita definida;
- fallback para `baseConnection` preservado;
- rollback especifico definido antes;
- plano de evidencias definido antes;
- criterios de bloqueio definidos antes;
- autorizacao explicita propria da fase posterior;
- baseline curta verde antes de qualquer avanco;
- `npm test` completo recomendado antes de qualquer publicacao de fase;
- ausencia de caller real;
- ausencia de rota, CLI, script, job, bootstrap ou request path;
- ausencia de alteracao em registry real;
- ausencia de alteracao em allowlist real;
- ausencia de abertura de tenant DB real nesta fase;
- ausencia de mudanca de roteamento;
- PostgreSQL fora do escopo.

### 10.2 Gates de bloqueio imediato

Registrar que qualquer item abaixo bloqueia execucao futura:

- ambiguidade sobre unidade, usuario, dados ou trafego;
- necessidade de Portal;
- necessidade de dado real;
- necessidade de trafego real;
- necessidade de usuario real;
- necessidade de unidade real;
- necessidade de PostgreSQL;
- ausencia de rollback definido;
- ausencia de plano de evidencias;
- ausencia de autorizacao explicita;
- falha de baseline curta;
- falha de `npm test` completo quando exigido;
- qualquer alteracao oportunista em codigo, scripts, rotas, registry, allowlist, modelRegistry ou BaseRepository;
- qualquer tentativa de plugar a execucao em request path.

Registrar que qualquer bloqueio deve degradar para nao executar.

### 10.3 Relacao entre gates e autorizacao

Registrar:

- gates definidos nao sao autorizacao;
- gates verdes em fase posterior nao sao autorizacao automatica;
- autorizacao deve ser explicita, propria e posterior;
- autorizacao deve mencionar escopo, candidato, rollback, evidencias e limites;
- autorizacao nao pode ser inferida de `eligible=true`, `executionScopeDefined=true`, `authorizationGatesDefined=true` ou baseline verde;
- qualquer duvida sobre autorizacao degrada para nao executar.

### 10.4 Resultado dos gates

Registrar:

- authorizationGatesDefined=true;
- executionScopeDefined permanece true;
- executionContractReady permanece false;
- rollbackDefined permanece false;
- evidencePlanDefined permanece false;
- executionStillForbidden permanece true;
- blockedReasons permanece [].

Interpretacao obrigatoria:

- authorizationGatesDefined=true significa apenas que os gates documentais foram definidos.
- authorizationGatesDefined=true nao autoriza execucao.
- authorizationGatesDefined=true nao autoriza preparacao operacional concreta.
- authorizationGatesDefined=true nao autoriza criar comando, script, caller real, rota, CLI, job, bootstrap ou request path.
- authorizationGatesDefined=true nao autoriza alterar registry real, allowlist real ou roteamento.
- authorizationGatesDefined=true nao autoriza abrir tenant DB real nesta fase.
- authorizationGatesDefined=true nao autoriza envolver Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

## 11. Plano documental de rollback da execucao manual controlada

Registrar que o rollback da Fase N e documental, preventivo e nao operacional.

### 11.1 Premissa do rollback

Registrar:

- A Fase N nao executa rollback real.
- A Fase N nao cria comando de rollback.
- A Fase N nao cria script de rollback.
- A Fase N nao altera registry real para permitir rollback.
- A Fase N nao altera allowlist real para permitir rollback.
- A Fase N nao abre tenant DB real para testar rollback.
- A Fase N apenas define quais garantias de rollback deveriam existir antes de qualquer execucao futura.

### 11.2 Estado seguro esperado

Registrar que o estado seguro esperado antes, durante e depois de qualquer fase posterior deve ser:

- fallback para `baseConnection` preservado;
- ausencia de alteracao em registry real durante a Fase N;
- ausencia de alteracao em allowlist real durante a Fase N;
- ausencia de tenant DB real aberto durante a Fase N;
- ausencia de mudanca de roteamento durante a Fase N;
- ausencia de caller real durante a Fase N;
- ausencia de rota, CLI, script, job, bootstrap ou request path durante a Fase N;
- ausencia de Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

### 11.3 Gatilhos de bloqueio e rollback futuro

Registrar que uma fase posterior devera bloquear ou reverter para estado seguro se ocorrer qualquer uma das condicoes abaixo:

- falha de gate obrigatorio;
- ambiguidade sobre unidade, usuario, dados ou trafego;
- tentativa de envolver Portal;
- tentativa de envolver dado real;
- tentativa de envolver trafego real;
- tentativa de envolver usuario real;
- tentativa de envolver unidade real;
- tentativa de envolver PostgreSQL;
- falha de fallback para `baseConnection`;
- tentativa de alterar registry real fora de autorizacao explicita;
- tentativa de alterar allowlist real fora de autorizacao explicita;
- tentativa de abrir tenant DB real fora de autorizacao explicita;
- tentativa de mudar roteamento fora de autorizacao explicita;
- tentativa de criar caller real, rota, CLI, script, job, bootstrap ou request path fora de autorizacao explicita;
- falha de baseline curta;
- falha de `npm test` completo quando exigido.

### 11.4 Acao segura padrao

Registrar:

- A acao segura padrao e nao executar.
- Se algo estiver ambiguo, nao executar.
- Se algum gate falhar, nao executar.
- Se algum artefato operacional aparecer fora de autorizacao explicita, bloquear.
- Se execucao futura chegar a ser autorizada em outra fase, rollback devera priorizar retorno ao fallback para `baseConnection`.
- Nenhum rollback futuro pode depender de Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

### 11.5 Resultado do rollback

Registrar:

- rollbackDefined=true;
- executionScopeDefined permanece true;
- authorizationGatesDefined permanece true;
- executionContractReady permanece false;
- evidencePlanDefined permanece false;
- executionStillForbidden permanece true;
- blockedReasons permanece [].

Interpretacao obrigatoria:

- rollbackDefined=true significa apenas que o rollback documental foi definido.
- rollbackDefined=true nao autoriza execucao.
- rollbackDefined=true nao autoriza execucao de rollback real.
- rollbackDefined=true nao autoriza preparacao operacional concreta.
- rollbackDefined=true nao autoriza criar comando, script, caller real, rota, CLI, job, bootstrap ou request path.
- rollbackDefined=true nao autoriza alterar registry real, allowlist real ou roteamento.
- rollbackDefined=true nao autoriza abrir tenant DB real nesta fase.
- rollbackDefined=true nao autoriza envolver Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

## 12. Interpretacao obrigatoria

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
