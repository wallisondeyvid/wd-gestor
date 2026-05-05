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
- riskCategoriesDefined=true
- riskSeverityDefined=true
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
- riskCategoriesDefined=true porque as categorias documentais de risco passaram a ser definidas neste microcorte.
- riskSeverityDefined=true porque severidade e probabilidade documentais passaram a ser definidas neste microcorte.
- mitigationPlanDefined=false porque o plano de mitigacao ainda nao foi definido.
- authorizationStillForbidden=true porque a Fase O nao autoriza execucao nem preparacao operacional concreta.
- executionStillForbidden=true porque nenhuma execucao e permitida nesta fase.
- operationalSurfaceStillForbidden=true porque nenhuma superficie operacional pode ser criada.
- candidateStillSynthetic=true porque o unico candidato permanece sintetico.
- nonOperationalPreserved=true porque a fase permanece documental.
- fallbackRequired=true porque fallback para `baseConnection` permanece obrigatorio.
- blockedReasons=[] porque nao ha bloqueio documental inicial; ha apenas ausencia da matriz completa.

## 7. Categorias documentais de risco

Registrar que as categorias de risco da Fase O sao documentais e preventivas. Elas nao autorizam execucao, nao substituem gates, nao substituem rollback, nao substituem evidencias e nao permitem criar superficie operacional.

### 7.1 Risco de autorizacao implicita

Registrar riscos relacionados a:

- interpretar documento como autorizacao;
- interpretar matriz de risco como autorizacao;
- interpretar baseline verde como autorizacao;
- interpretar ausencia de bloqueio documental como autorizacao;
- interpretar conclusao de fase anterior como autorizacao;
- interpretar `executionContractReady=true` da Fase N como autorizacao.

### 7.2 Risco de materializar candidato sintetico

Registrar riscos relacionados a:

- transformar candidato sintetico em operacao real;
- copiar identificadores sinteticos para codigo de producao;
- usar unidade sintetica fora de documentacao/testes controlados;
- criar allowlist real para candidato sintetico sem fase propria;
- abrir tenant DB real para candidato sintetico;
- confundir dados descartaveis com dados reais.

### 7.3 Risco de superficie operacional acidental

Registrar riscos relacionados a criar ou alterar:

- caller real;
- rota;
- CLI;
- script;
- job;
- bootstrap;
- request path;
- package.json;
- integracao com Portal;
- caminho de autenticacao;
- caminho de API real.

### 7.4 Risco de registry, allowlist e roteamento

Registrar riscos relacionados a:

- alterar registry real;
- alterar allowlist real;
- alterar cache/preload/readers/writers;
- mudar roteamento;
- remover ou enfraquecer fallback para `baseConnection`;
- criar resolucao tenant-aware fora de contrato proprio;
- ativar unidade por ambiguidade.

### 7.5 Risco de dados, trafego e usuarios reais

Registrar riscos relacionados a envolver:

- Portal;
- dados reais;
- trafego real;
- usuario real;
- unidade real;
- credenciais reais;
- tenant real;
- ambiente produtivo;
- auditoria baseada em dados nao descartaveis.

### 7.6 Risco de rollback insuficiente

Registrar riscos relacionados a:

- discutir execucao sem rollback proprio;
- executar sem regra de interrupcao;
- executar sem plano de reversao;
- executar sem criterio de estado seguro;
- tratar rollback documental como rollback real;
- executar rollback real sem autorizacao propria.

### 7.7 Risco de evidencia insuficiente

Registrar riscos relacionados a:

- aceitar evidencia documental como evidencia operacional real;
- aceitar log solto como evidencia suficiente;
- aceitar baseline curta como validacao completa;
- avancar sem `npm test` completo quando exigido;
- nao registrar a tupla completa da suite final quando publicar fase;
- nao diferenciar evidencia antes, durante e depois.

### 7.8 Risco de PostgreSQL fora de hora

Registrar riscos relacionados a:

- envolver PostgreSQL antes da fase propria;
- misturar migracao multi-tenant MongoDB com migracao de banco;
- criar abstracao pensando em PostgreSQL agora;
- alterar contratos por causa de uma migracao futura ainda fora do escopo.

### 7.9 Risco de alteracao oportunista

Registrar riscos relacionados a:

- aproveitar microcorte documental para alterar codigo;
- alterar testes sem necessidade;
- mudar contratos existentes fora do escopo;
- refatorar arquivos sensiveis;
- alterar scripts, package.json ou rotas;
- abrir fase posterior automaticamente;
- fazer push antes de fechamento global e autorizacao explicita.

### 7.10 Resultado das categorias

Registrar:

- riskCategoriesDefined=true;
- riskMatrixOpened permanece true;
- riskMatrixDefined permanece false;
- riskSeverityDefined permanece false;
- mitigationPlanDefined permanece false;
- authorizationStillForbidden permanece true;
- executionStillForbidden permanece true;
- operationalSurfaceStillForbidden permanece true;
- candidateStillSynthetic permanece true;
- nonOperationalPreserved permanece true;
- fallbackRequired permanece true;
- blockedReasons permanece [].

Interpretacao obrigatoria:

- riskCategoriesDefined=true significa apenas que as categorias documentais de risco foram definidas.
- riskCategoriesDefined=true nao autoriza execucao.
- riskCategoriesDefined=true nao autoriza preparacao operacional concreta.
- riskCategoriesDefined=true nao autoriza coleta de evidencia operacional real.
- riskCategoriesDefined=true nao autoriza rollback real.
- riskCategoriesDefined=true nao autoriza criar comando, script, caller real, rota, CLI, job, bootstrap ou request path.
- riskCategoriesDefined=true nao autoriza alterar registry real, allowlist real ou roteamento.
- riskCategoriesDefined=true nao autoriza abrir tenant DB real.
- riskCategoriesDefined=true nao autoriza envolver Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

## 8. Severidade e probabilidade documentais

Registrar que severidade e probabilidade sao documentais e preventivas. Elas nao autorizam execucao, nao substituem mitigacao, nao substituem rollback, nao substituem evidencia e nao permitem criacao de superficie operacional.

### 8.1 Escala de severidade

- Baixa: risco com impacto apenas textual/documental, sem efeito operacional possivel se os gates forem preservados.
- Media: risco que pode gerar ambiguidade documental relevante ou induzir interpretacao incorreta.
- Alta: risco que pode induzir criacao indevida de superficie operacional, alteracao de contrato sensivel ou enfraquecimento de fallback.
- Critica: risco que pode levar a execucao real, uso de dados reais, trafego real, unidade real, Portal, alteracao de registry/allowlist real, tenant DB real, roteamento real ou PostgreSQL fora de fase.

### 8.2 Escala de probabilidade

- Baixa: improvavel no fluxo atual, desde que restricoes e revisao sejam mantidas.
- Media: possivel se houver interpretacao apressada ou microcorte amplo demais.
- Alta: provavel se houver autorizacao ambigua, prompt frouxo ou alteracao fora do escopo.
- Critica: provavel e perigosa se forem criados comandos, scripts, callers reais, rotas, jobs, bootstrap ou request path sem fase propria.

### 8.3 Classificacao inicial das categorias

1. Risco de autorizacao implicita
	- Severidade: Critica
	- Probabilidade: Alta
	- Motivo: pode transformar documento, baseline ou fase anterior em autorizacao indevida.

2. Risco de materializar candidato sintetico
	- Severidade: Critica
	- Probabilidade: Media
	- Motivo: pode deslocar identificadores sinteticos para operacao real, allowlist real ou tenant DB real.

3. Risco de superficie operacional acidental
	- Severidade: Critica
	- Probabilidade: Media
	- Motivo: pode criar caller real, rota, CLI, script, job, bootstrap, request path, package.json ou Portal fora de fase.

4. Risco de registry, allowlist e roteamento
	- Severidade: Critica
	- Probabilidade: Media
	- Motivo: pode alterar registry real, allowlist real, cache/preload/readers/writers, roteamento ou fallback.

5. Risco de dados, trafego e usuarios reais
	- Severidade: Critica
	- Probabilidade: Baixa
	- Motivo: impacto maximo se ocorrer, embora o fluxo atual ainda bloqueie Portal, dados reais, trafego real, usuario real e unidade real.

6. Risco de rollback insuficiente
	- Severidade: Alta
	- Probabilidade: Media
	- Motivo: pode permitir discussao de execucao sem reversao, interrupcao ou estado seguro proprios.

7. Risco de evidencia insuficiente
	- Severidade: Alta
	- Probabilidade: Alta
	- Motivo: pode induzir avanco com baseline curta, log solto ou evidencia documental confundida com evidencia operacional real.

8. Risco de PostgreSQL fora de hora
	- Severidade: Alta
	- Probabilidade: Baixa
	- Motivo: PostgreSQL e objetivo futuro, mas esta fora do escopo da migracao multi-tenant atual em MongoDB.

9. Risco de alteracao oportunista
	- Severidade: Alta
	- Probabilidade: Media
	- Motivo: pode ampliar microcorte documental para codigo, testes, scripts, package.json, rotas ou refatoracoes fora do escopo.

### 8.4 Resultado da classificacao

Registrar:

- riskSeverityDefined=true;
- riskCategoriesDefined permanece true;
- riskMatrixOpened permanece true;
- riskMatrixDefined permanece false;
- mitigationPlanDefined permanece false;
- authorizationStillForbidden permanece true;
- executionStillForbidden permanece true;
- operationalSurfaceStillForbidden permanece true;
- candidateStillSynthetic permanece true;
- nonOperationalPreserved permanece true;
- fallbackRequired permanece true;
- blockedReasons permanece [].

Interpretacao obrigatoria:

- riskSeverityDefined=true significa apenas que severidade e probabilidade documentais foram definidas.
- riskSeverityDefined=true nao autoriza execucao.
- riskSeverityDefined=true nao autoriza preparacao operacional concreta.
- riskSeverityDefined=true nao autoriza coleta de evidencia operacional real.
- riskSeverityDefined=true nao autoriza rollback real.
- riskSeverityDefined=true nao autoriza criar comando, script, caller real, rota, CLI, job, bootstrap ou request path.
- riskSeverityDefined=true nao autoriza alterar registry real, allowlist real ou roteamento.
- riskSeverityDefined=true nao autoriza abrir tenant DB real.
- riskSeverityDefined=true nao autoriza envolver Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

## 9. Superficies proibidas

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

## 10. Criterio de avanco da Fase O

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

## 11. Interpretacao obrigatoria

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
