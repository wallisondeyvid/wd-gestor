# Fase G - EntryPoint Manual Deliberado e Piloto Nao Produtivo Multi-DB

## 1. Nome da fase

- Fase G - EntryPoint Manual Deliberado e Piloto Nao Produtivo Multi-DB.

## 2. Estado herdado da Fase F

- o owner interno manual minimo ja existe em `src/shared/db/unitDatabaseRegistryManualOwner.js`;
- o owner permanece sem caller real;
- nao existe entrypoint manual deliberado;
- nao existe rota;
- nao existe CLI;
- nao existe script;
- nao existe job;
- nao existe bootstrap;
- nao existe request path;
- nao houve ativacao real;
- nao houve unidade real;
- nao houve dados reais.

Leitura operacional herdada:

- `runUnitDatabaseRegistryManualOwner` continua sendo funcao interna minima;
- o owner chama apenas `registerUnitDatabaseRegistryPending`, `markUnitDatabaseRegistryReady` e `activateUnitDatabaseRegistry`;
- o owner nao chama `resolveConnection`;
- o owner nao decide tenant routing;
- o owner nao abre tenant connection;
- `resolveConnection` continua sendo o unico decisor de tenant routing;
- preload continua fora como owner operacional.

## 3. Objetivo da Fase G

- sair do owner interno isolado para uma borda manual e deliberada acima dele;
- formalizar o contrato do futuro entrypoint antes de qualquer implementacao;
- preparar a fase futura de piloto nao produtivo em corredor controlado;
- manter ativacao real ou produtiva explicitamente fora de escopo.

## 4. Definicao do futuro entrypoint

O futuro entrypoint admissivel desta fase deve ser:

- funcao interna separada;
- wrapper manual e deliberado sobre `runUnitDatabaseRegistryManualOwner`;
- sem wiring automatico;
- sem exposicao HTTP;
- sem rota;
- sem request path;
- sem CLI como primeiro passo;
- sem script solto como solucao principal;
- sem job;
- sem bootstrap;
- sem preload;
- sem caller real nesta abertura documental.

Leitura operacional:

- o entrypoint futuro nao substitui o owner;
- o entrypoint futuro fica acima do owner como borda interna de validacao e relato;
- o owner continua sendo o miolo minimo de orquestracao `pending -> ready -> active`;
- o entrypoint futuro podera chamar `runUnitDatabaseRegistryManualOwner` diretamente quando existir implementacao minima propria.

## 5. Responsabilidades permitidas

- validar pre-condicoes operacionais antes de chamar o owner;
- validar ambiente nao produtivo;
- validar unidade sintetica ou espelho controlado;
- validar contexto manual explicito;
- validar plano de rollback previamente definido;
- validar allowlist unitaria prevista para a unidade alvo;
- validar coerencia minima de `unidadeId`, `dbName` e `databaseKey`;
- documentar flags esperadas do corredor;
- chamar `runUnitDatabaseRegistryManualOwner` quando houver implementacao futura;
- produzir relatorio deterministico;
- registrar claramente que o entrypoint nao decide routing.

## 6. Responsabilidades proibidas

- nao escrever registry diretamente;
- nao chamar writer diretamente, salvo justificativa explicita em fase futura propria;
- nao chamar `resolveConnection` como decisor operacional;
- nao abrir tenant connection;
- nao decidir allowlist como atalho de liberacao;
- nao plugar em rota;
- nao plugar em CLI;
- nao plugar em script;
- nao plugar em job;
- nao executar em bootstrap;
- nao executar em preload;
- nao operar unidade real;
- nao operar dados reais;
- nao remover o fallback para `baseConnection`.

Leitura operacional adicional:

- o entrypoint futuro nao rebaixa o owner nem o writer a detalhes intercambiaveis;
- o entrypoint futuro nao reabre runtime comum;
- o entrypoint futuro nao transforma o corredor em superficie administrativa exposta.

## 7. Pre-condicoes minimas

- ambiente nao produtivo;
- unidade sintetica ou espelho controlado;
- database dedicado previamente provisionado;
- `databaseKey` e `dbName` coerentes com a unidade alvo;
- flags esperadas documentadas antes da execucao;
- allowlist unitaria planejada para a unidade alvo;
- contexto manual com `actor`, `reason`, `approved=true` e `source=manual`;
- rollback definido antes de qualquer ativacao deliberada.

Leitura operacional:

- pre-condicao ausente bloqueia a execucao;
- contexto manual explicito continua obrigatorio mesmo em fase futura de implementacao minima;
- duvida operacional deve degradar para nao executar o entrypoint.

## 8. Saida minima esperada do futuro entrypoint

Saida minima esperada:

- `ok`;
- `unidadeId`;
- `actor`;
- `reason`;
- `ambiente`;
- `statusInicialEsperado`;
- `etapasExecutadas`;
- `ownerResult`;
- `posCondicoesEsperadas`;
- `rollbackHint`.

Observacoes obrigatorias de contrato:

- o relatorio deve ser deterministico e legivel;
- o relatorio deve explicitar que a validacao de `resolveConnection` pertence a teste, harness ou rodada propria, e nao a uma decisao do entrypoint;
- o relatorio nao substitui teste arquitetural;
- o relatorio nao autoriza piloto por si so.

## 9. Sequencia recomendada da Fase G

- microcorte 1: contrato documental do entrypoint manual deliberado;
- microcorte 2: teste arquitetural do entrypoint como helper ou harness, sem caller real;
- microcorte 3: implementacao de funcao interna minima de entrypoint, sem caller real;
- microcorte 4: documentacao da implementacao;
- microcorte 5: decisao read-only sobre piloto nao produtivo.

Leitura operacional da sequencia:

- o piloto nao produtivo vem depois do contrato, do teste e da implementacao minima do entrypoint;
- CLI, script, rota, job, bootstrap e preload continuam caminhos a evitar como primeiro movimento;
- o primeiro passo da Fase G e documental por desenho, e nao por ausencia de codigo.

## 10. Fora de escopo

- producao;
- unidade real;
- dados reais;
- PostgreSQL;
- rota admin;
- rota interna;
- CLI;
- script;
- job;
- bootstrap;
- preload automatico;
- request path;
- Portal do Morador;
- Condominios amplo;
- Gestor/Core residual;
- Clinica.

## 11. Regra de acumulacao desta abertura

- esta abertura da Fase G permanece estritamente documental;
- este microcorte nao cria entrypoint;
- este microcorte nao cria teste;
- este microcorte nao cria caller real;
- push nao deve ocorrer neste microcorte inicial;
- commits locais futuros, se houver continuidade, devem acumular ate fechamento de bloco ou de fase.
