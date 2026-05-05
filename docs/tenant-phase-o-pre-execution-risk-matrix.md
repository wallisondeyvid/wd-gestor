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
- riskMatrixDefined=true
- riskCategoriesDefined=true
- riskSeverityDefined=true
- mitigationPlanDefined=true
- authorizationStillForbidden=true
- executionStillForbidden=true
- operationalSurfaceStillForbidden=true
- candidateStillSynthetic=true
- nonOperationalPreserved=true
- fallbackRequired=true
- blockedReasons=[]

Explicar:

- riskMatrixOpened=true porque a Fase O foi aberta documentalmente.
- riskMatrixDefined=true porque a matriz documental preventiva passou a ser consolidada neste microcorte.
- riskCategoriesDefined=true porque as categorias documentais de risco passaram a ser definidas neste microcorte.
- riskSeverityDefined=true porque severidade e probabilidade documentais passaram a ser definidas neste microcorte.
- mitigationPlanDefined=true porque as mitigacoes documentais preventivas passaram a ser definidas neste microcorte.
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

## 9. Mitigacoes documentais preventivas

Registrar que as mitigacoes da Fase O sao documentais e preventivas. Elas nao autorizam execucao, nao substituem rollback real, nao substituem evidencia operacional real, nao autorizam preparacao operacional concreta e nao permitem criacao de superficie operacional.

### 9.1 Mitigacao contra autorizacao implicita

Registrar mitigacoes:

- toda fase deve declarar explicitamente se autoriza ou nao autoriza execucao;
- todo gate documental deve ter interpretacao obrigatoria;
- baseline verde nao pode ser tratada como autorizacao;
- ausencia de blockedReasons nao pode ser tratada como autorizacao;
- conclusao de fase anterior nao pode abrir fase posterior automaticamente;
- `executionContractReady=true` da Fase N permanece apenas contrato documental;
- qualquer execucao futura exigiria fase propria, autorizacao propria, rollback proprio, evidencias proprias e gates proprios.

### 9.2 Mitigacao contra materializacao do candidato sintetico

Registrar mitigacoes:

- identificadores sinteticos permanecem restritos a documentacao e testes controlados existentes;
- e proibido copiar candidato sintetico para src, scripts, package.json, rotas, jobs, bootstrap ou request path;
- allowlist real nao pode ser criada nesta fase;
- tenant DB real nao pode ser aberto nesta fase;
- dados descartaveis nao podem ser tratados como dados reais;
- qualquer uso operacional futuro exigiria contrato proprio e autorizacao propria.

### 9.3 Mitigacao contra superficie operacional acidental

Registrar mitigacoes:

- microcortes da Fase O so podem alterar documentacao explicitamente permitida;
- qualquer alteracao em caller real, rota, CLI, script, job, bootstrap ou request path deve bloquear o avanco;
- package.json nao pode receber comandos ligados a Fase O;
- Portal, autenticacao e API real permanecem fora do escopo;
- qualquer superficie operacional detectada deve ser revertida antes de prosseguir.

### 9.4 Mitigacao contra alteracao indevida de registry, allowlist e roteamento

Registrar mitigacoes:

- registry real permanece intocado;
- allowlist real permanece intocada;
- cache/preload/readers/writers permanecem fora do escopo;
- roteamento permanece inalterado;
- fallback para `baseConnection` permanece obrigatorio;
- qualquer enfraquecimento de fallback bloqueia o avanco;
- nenhuma resolucao tenant-aware nova pode ser criada nesta fase.

### 9.5 Mitigacao contra dados, trafego e usuarios reais

Registrar mitigacoes:

- Portal permanece proibido;
- dados reais permanecem proibidos;
- trafego real permanece proibido;
- usuario real permanece proibido;
- unidade real permanece proibida;
- credenciais reais permanecem proibidas;
- ambiente produtivo permanece proibido;
- qualquer indicio de dado nao descartavel bloqueia o avanco.

### 9.6 Mitigacao contra rollback insuficiente

Registrar mitigacoes:

- rollback documental nao pode ser tratado como rollback real;
- qualquer execucao futura exigiria rollback proprio antes da execucao;
- regra de interrupcao precisa existir antes de qualquer execucao futura;
- estado seguro precisa ser definido antes de qualquer execucao futura;
- rollback real nao pode ser executado nesta fase;
- ausencia de rollback proprio bloqueia qualquer discussao operacional futura.

### 9.7 Mitigacao contra evidencia insuficiente

Registrar mitigacoes:

- evidencia documental deve ser separada de evidencia operacional real;
- baseline curta so valida microcorte documental;
- quando houver fechamento global de fase, `npm test` completo deve ser exigido antes de push;
- a tupla completa da suite final deve ser registrada no status global quando a fase for publicada;
- log solto nao deve ser tratado como evidencia suficiente;
- evidencia antes, durante e depois deve ser distinguida em qualquer fase futura que autorize operacao.

### 9.8 Mitigacao contra PostgreSQL fora de hora

Registrar mitigacoes:

- PostgreSQL permanece fora do escopo da Fase O;
- migracao multi-tenant atual continua em MongoDB;
- nenhuma abstracao deve ser alterada agora por causa de PostgreSQL futuro;
- qualquer mencao a PostgreSQL deve ser tratada como risco bloqueante se induzir alteracao funcional;
- PostgreSQL so podera voltar em fase propria futura, explicitamente aberta.

### 9.9 Mitigacao contra alteracao oportunista

Registrar mitigacoes:

- microcorte documental nao pode virar refatoracao;
- alteracoes em codigo, testes, scripts, package.json, rotas ou arquivos sensiveis bloqueiam avanco;
- fase posterior nao pode ser aberta automaticamente;
- push so pode ocorrer no fechamento global da fase, apos validacao completa e autorizacao explicita;
- qualquer alteracao fora do arquivo permitido deve ser revertida antes do commit.

### 9.10 Resultado das mitigacoes

Registrar:

- mitigationPlanDefined=true;
- riskSeverityDefined permanece true;
- riskCategoriesDefined permanece true;
- riskMatrixOpened permanece true;
- riskMatrixDefined permanece false;
- authorizationStillForbidden permanece true;
- executionStillForbidden permanece true;
- operationalSurfaceStillForbidden permanece true;
- candidateStillSynthetic permanece true;
- nonOperationalPreserved permanece true;
- fallbackRequired permanece true;
- blockedReasons permanece [].

Interpretacao obrigatoria:

- mitigationPlanDefined=true significa apenas que mitigacoes documentais preventivas foram definidas.
- mitigationPlanDefined=true nao autoriza execucao.
- mitigationPlanDefined=true nao autoriza preparacao operacional concreta.
- mitigationPlanDefined=true nao autoriza coleta de evidencia operacional real.
- mitigationPlanDefined=true nao autoriza rollback real.
- mitigationPlanDefined=true nao autoriza criar comando, script, caller real, rota, CLI, job, bootstrap ou request path.
- mitigationPlanDefined=true nao autoriza alterar registry real, allowlist real ou roteamento.
- mitigationPlanDefined=true nao autoriza abrir tenant DB real.
- mitigationPlanDefined=true nao autoriza envolver Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.

## 10. Matriz consolidada de riscos

Registrar que a matriz consolidada da Fase O e documental, preventiva, nao operacional e nao autorizativa. Ela integra categorias, severidade, probabilidade, mitigacao, gatilho de bloqueio e evidencia esperada, mas nao autoriza execucao, nao autoriza preparacao operacional concreta, nao autoriza rollback real e nao substitui fase propria futura.

| ID | Categoria | Severidade | Probabilidade | Mitigacao preventiva | Gatilho de bloqueio | Evidencia esperada |
|---|---|---|---|---|---|---|
| O-R1 | Autorizacao implicita | Critica | Alta | Declaracao explicita de nao autorizacao em cada gate e fase | Qualquer texto tratando documento, baseline ou fase anterior como autorizacao | Diff documental demonstrando interpretacao obrigatoria |
| O-R2 | Materializacao do candidato sintetico | Critica | Media | Manter identificadores sinteticos restritos a documentacao/testes controlados | Candidato sintetico em src, scripts, package.json, rota, job, bootstrap, request path, allowlist real ou tenant DB real | Busca/read-only sem ocorrencia operacional indevida |
| O-R3 | Superficie operacional acidental | Critica | Media | Restringir microcortes da Fase O a documentacao permitida | Criacao/alteracao de caller real, rota, CLI, script, job, bootstrap, request path, package.json, Portal, autenticacao ou API real | git diff/name-only restrito aos arquivos permitidos |
| O-R4 | Registry, allowlist e roteamento | Critica | Media | Manter registry, allowlist, cache/preload/readers/writers e roteamento intocados | Alteracao em registry real, allowlist real, cache/preload/readers/writers, roteamento ou fallback | Busca/diff confirmando ausencia de alteracao em superficies sensiveis |
| O-R5 | Dados, trafego e usuarios reais | Critica | Baixa | Manter Portal, dados reais, trafego real, usuario real, unidade real, credenciais reais e ambiente produtivo proibidos | Qualquer indicio de dado nao descartavel, trafego real, usuario real, unidade real ou credencial real | Evidencia documental de escopo sintetico/nao produtivo |
| O-R6 | Rollback insuficiente | Alta | Media | Exigir rollback proprio antes de qualquer execucao futura | Discussao operacional sem reversao, interrupcao ou estado seguro proprios | Documento declara que rollback documental nao e rollback real |
| O-R7 | Evidencia insuficiente | Alta | Alta | Separar evidencia documental de evidencia operacional real e exigir npm test completo no fechamento global | Baseline curta, log solto ou evidencia documental usada como prova operacional | Registro explicito de limites da evidencia e tupla completa em fechamento futuro |
| O-R8 | PostgreSQL fora de hora | Alta | Baixa | Manter PostgreSQL fora do escopo da Fase O e da migracao multi-tenant atual | Qualquer alteracao funcional motivada por PostgreSQL futuro | Diff sem alteracao funcional e mencao a PostgreSQL apenas como risco bloqueado |
| O-R9 | Alteracao oportunista | Alta | Media | Bloquear qualquer alteracao fora do microcorte documental permitido | Alteracao em codigo, testes, scripts, package.json, rotas ou arquivos sensiveis | git diff/name-only restrito ao documento permitido |

### 10.1 Resultado da consolidacao

Registrar:

- riskMatrixDefined=true;
- mitigationPlanDefined permanece true;
- riskSeverityDefined permanece true;
- riskCategoriesDefined permanece true;
- riskMatrixOpened permanece true;
- authorizationStillForbidden permanece true;
- executionStillForbidden permanece true;
- operationalSurfaceStillForbidden permanece true;
- candidateStillSynthetic permanece true;
- nonOperationalPreserved permanece true;
- fallbackRequired permanece true;
- blockedReasons permanece [].

Interpretacao obrigatoria:

- riskMatrixDefined=true significa apenas que a matriz documental preventiva foi consolidada.
- riskMatrixDefined=true nao autoriza execucao.
- riskMatrixDefined=true nao autoriza preparacao operacional concreta.
- riskMatrixDefined=true nao autoriza coleta de evidencia operacional real.
- riskMatrixDefined=true nao autoriza rollback real.
- riskMatrixDefined=true nao autoriza criar comando, script, caller real, rota, CLI, job, bootstrap ou request path.
- riskMatrixDefined=true nao autoriza alterar registry real, allowlist real ou roteamento.
- riskMatrixDefined=true nao autoriza abrir tenant DB real.
- riskMatrixDefined=true nao autoriza envolver Portal, dados reais, trafego real, usuario real, unidade real ou PostgreSQL.
- riskMatrixDefined=true nao abre fase posterior automaticamente.

## 11. Superficies proibidas

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

## 12. Criterio de avanco da Fase O

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

## 13. Interpretacao obrigatoria

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
